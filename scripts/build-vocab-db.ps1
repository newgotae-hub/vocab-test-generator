param(
  [string]$BasicPath = "",
  [string]$AdvancedPath = "",
  [string]$EtymologyPath = "",
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\src\data\vocab-db.json")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-DataFile {
  param(
    [string]$ExplicitPath,
    [string]$FilePattern,
    [string]$ExcludeName = ""
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    return (Resolve-Path $ExplicitPath).Path
  }

  $root = Join-Path $HOME "OneDrive"
  $match = Get-ChildItem -Path $root -Filter $FilePattern -File -Recurse |
    Where-Object { [string]::IsNullOrWhiteSpace($ExcludeName) -or $_.Name -ne $ExcludeName } |
    Select-Object -First 1

  if (-not $match) {
    throw "Could not find $FilePattern under $root"
  }

  return $match.FullName
}

function Read-ZipEntryText {
  param($Zip, [string]$EntryName)

  $entry = $Zip.Entries | Where-Object { $_.FullName -eq $EntryName } | Select-Object -First 1
  if (-not $entry) {
    return $null
  }

  $stream = $entry.Open()
  $reader = New-Object System.IO.StreamReader($stream)

  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Close()
    $stream.Close()
  }
}

function Resolve-CellValue {
  param($Cell, $SharedStrings)

  if (-not $Cell) {
    return ""
  }

  if ($Cell.t -eq "s") {
    $index = 0
    [void][int]::TryParse([string]$Cell.v, [ref]$index)
    if ($index -ge 0 -and $index -lt $SharedStrings.Count) {
      return [string]$SharedStrings[$index]
    }
    return ""
  }

  if ($Cell.is -and $Cell.is.t) {
    return [string]$Cell.is.t
  }

  return [string]$Cell.v
}

function Get-ColumnIndexFromReference {
  param([string]$Reference)

  if ([string]::IsNullOrWhiteSpace($Reference)) {
    return $null
  }

  $letters = ([regex]::Match($Reference, "^[A-Z]+")).Value
  if ([string]::IsNullOrWhiteSpace($letters)) {
    return $null
  }

  $index = 0
  foreach ($character in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$character - [int][char]'A' + 1)
  }

  return $index - 1
}

function Get-XlsxRows {
  param(
    [string]$Path,
    [string]$SheetPath = "xl/worksheets/sheet1.xml"
  )

  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)

  try {
    $sharedStrings = New-Object System.Collections.Generic.List[string]
    $sharedText = Read-ZipEntryText -Zip $zip -EntryName "xl/sharedStrings.xml"

    if ($sharedText) {
      $sharedXml = New-Object System.Xml.XmlDocument
      $sharedXml.LoadXml($sharedText)

      $ns = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
      $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

      $siNodes = $sharedXml.SelectNodes("//x:si", $ns)
      foreach ($si in $siNodes) {
        $textNodes = $si.SelectNodes(".//x:t", $ns)
        $value = ""
        foreach ($textNode in $textNodes) {
          $value += $textNode.InnerText
        }
        $sharedStrings.Add($value)
      }
    }

    $sheetText = Read-ZipEntryText -Zip $zip -EntryName $SheetPath
    if (-not $sheetText) {
      throw "Sheet not found: $SheetPath"
    }

    $sheetXml = New-Object System.Xml.XmlDocument
    $sheetXml.LoadXml($sheetText)

    $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
    $sheetNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

    $rowNodes = $sheetXml.SelectNodes("//x:sheetData/x:row", $sheetNs)
    $rows = New-Object System.Collections.Generic.List[object]

    foreach ($row in $rowNodes) {
      $cellNodes = $row.SelectNodes("./x:c", $sheetNs)
      $values = New-Object System.Collections.Generic.List[string]

      foreach ($cellNode in $cellNodes) {
        $columnIndex = Get-ColumnIndexFromReference -Reference ([string]$cellNode.r)
        while ($null -ne $columnIndex -and $values.Count -lt $columnIndex) {
          $values.Add("")
        }

        $value = Resolve-CellValue -Cell $cellNode -SharedStrings $sharedStrings
        $values.Add(($value -replace "`r|`n", " ").Trim())
      }

      $rows.Add(@($values))
    }

    return $rows.ToArray()
  } finally {
    $zip.Dispose()
  }
}

function Normalize-String {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }

  $text = [string]$Value
  $trimmed = $text.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $null
  }

  return $trimmed
}

function Build-SearchText {
  param(
    [string]$Term,
    [string]$Meaning,
    [object[]]$Derivatives,
    [string]$Chapter,
    [string]$Root
  )

  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($value in @($Term, $Meaning, $Chapter, $Root)) {
    $normalized = Normalize-String $value
    if ($normalized) {
      $parts.Add($normalized)
    }
  }

  foreach ($derivative in $Derivatives) {
    foreach ($value in @($derivative.term, $derivative.meaning)) {
      $normalized = Normalize-String $value
      if ($normalized) {
        $parts.Add($normalized)
      }
    }
  }

  return (($parts -join " ") -replace "\s+", " ").Trim().ToLowerInvariant()
}

function Get-Derivatives {
  param([string[]]$Row)

  $pairs = New-Object System.Collections.Generic.List[object]

  for ($index = 2; $index -lt $Row.Count; $index += 2) {
    $term = if ($index -lt $Row.Count) { Normalize-String $Row[$index] } else { $null }
    $meaning = if (($index + 1) -lt $Row.Count) { Normalize-String $Row[$index + 1] } else { $null }

    if (-not $term -and -not $meaning) {
      continue
    }

    $pairs.Add([ordered]@{
        term = if ($term) { $term } else { "" }
        meaning = if ($meaning) { $meaning } else { "" }
      })
  }

  return $pairs.ToArray()
}

function Build-GroupedCollection {
  param(
    [string]$CollectionId,
    [string]$Name,
    [string]$Subtitle,
    [string]$Description,
    [string]$ItemLabel,
    [object[]]$Records
  )

  $groupMap = @{}

  foreach ($record in $Records) {
    if (-not $groupMap.ContainsKey($record.groupId)) {
      $groupMap[$record.groupId] = [ordered]@{
        id = $record.groupId
        label = $record.groupLabel
        index = $record.groupIndex
        count = 0
      }
    }

    $groupMap[$record.groupId].count += 1
  }

  $groups = @(
    $groupMap.Values |
      Sort-Object { [int]$_.index } |
      ForEach-Object {
        [ordered]@{
          id = $_.id
          label = $_.label
          index = $_.index
          count = $_.count
        }
      }
  )

  return [ordered]@{
    id = $CollectionId
    name = $Name
    subtitle = $Subtitle
    description = $Description
    itemLabel = $ItemLabel
    totalRecords = $Records.Count
    totalGroups = $groups.Count
    groups = $groups
    records = $Records
  }
}

function Build-BasicCollection {
  param([string]$Path)

  $rows = Get-XlsxRows -Path $Path
  $records = New-Object System.Collections.Generic.List[object]
  $dataRows = @($rows | Select-Object -Skip 1)

  for ($index = 0; $index -lt $dataRows.Count; $index += 1) {
    $row = $dataRows[$index]
    $term = Normalize-String $row[0]
    $meaning = Normalize-String $row[1]
    if (-not $term -or -not $meaning) {
      continue
    }

    $order = $index + 1
    $groupIndex = [Math]::Ceiling($order / 100)
    $groupId = "day-{0:00}" -f $groupIndex
    $groupLabel = "DAY {0:00}" -f $groupIndex
    $derivatives = Get-Derivatives -Row $row

    $records.Add([ordered]@{
        id = "basic-{0:0000}" -f $order
        collectionId = "basic"
        term = $term
        meaning = $meaning
        derivatives = $derivatives
        groupId = $groupId
        groupLabel = $groupLabel
        groupIndex = $groupIndex
        chapter = $null
        root = $null
        page = $null
        source = "DB_comma_space_fixed.xlsx"
        order = $order
        searchText = Build-SearchText -Term $term -Meaning $meaning -Derivatives $derivatives -Chapter $null -Root $null
      })
  }

  return Build-GroupedCollection `
    -CollectionId "basic" `
    -Name "Basic" `
    -Subtitle "Core track" `
    -Description "3,000 foundation words organized into a 30-day flow." `
    -ItemLabel "day" `
    -Records $records.ToArray()
}

function Build-AdvancedCollection {
  param([string]$Path)

  $rows = Import-Csv -Path $Path
  $records = New-Object System.Collections.Generic.List[object]

  for ($index = 0; $index -lt $rows.Count; $index += 1) {
    $row = $rows[$index]
    $values = @($row.PSObject.Properties | ForEach-Object { $_.Value })
    $term = Normalize-String $values[0]
    $meaning = Normalize-String $values[1]
    if (-not $term -or -not $meaning) {
      continue
    }

    $order = $index + 1
    $groupIndex = [Math]::Ceiling($order / 50)
    $groupId = "set-{0:00}" -f $groupIndex
    $groupLabel = "SET {0:00}" -f $groupIndex
    $derivatives = Get-Derivatives -Row $values

    $records.Add([ordered]@{
        id = "advanced-{0:0000}" -f $order
        collectionId = "advanced"
        term = $term
        meaning = $meaning
        derivatives = $derivatives
        groupId = $groupId
        groupLabel = $groupLabel
        groupIndex = $groupIndex
        chapter = $null
        root = $null
        page = $null
        source = "DB-advanced.csv"
        order = $order
        searchText = Build-SearchText -Term $term -Meaning $meaning -Derivatives $derivatives -Chapter $null -Root $null
      })
  }

  return Build-GroupedCollection `
    -CollectionId "advanced" `
    -Name "Advanced" `
    -Subtitle "Expansion track" `
    -Description "1,500 higher-difficulty words organized into 30 fast review sets." `
    -ItemLabel "set" `
    -Records $records.ToArray()
}

function Build-EtymologyCollection {
  param([string]$Path)

  $rows = Get-XlsxRows -Path $Path -SheetPath "xl/worksheets/sheet1.xml"
  $records = New-Object System.Collections.Generic.List[object]
  $dataRows = @($rows | Select-Object -Skip 1)
  $chapterOrder = @{}
  $nextIndex = 1
  $currentChapter = $null
  $currentRoot = $null

  for ($index = 0; $index -lt $dataRows.Count; $index += 1) {
    $row = $dataRows[$index]
    $chapterValue = Normalize-String $row[0]
    $rootValue = Normalize-String $row[1]
    $term = Normalize-String $row[2]
    $meaning = Normalize-String $row[3]

    if ($chapterValue) {
      $currentChapter = $chapterValue
    }

    if ($rootValue) {
      $currentRoot = $rootValue
    }

    $chapter = $currentChapter
    $root = $currentRoot

    if (-not $chapter -or -not $term -or -not $meaning) {
      continue
    }

    if (-not $chapterOrder.ContainsKey($chapter)) {
      $chapterOrder[$chapter] = $nextIndex
      $nextIndex += 1
    }

    $order = $index + 1
    $groupIndex = $chapterOrder[$chapter]
    $groupId = $chapter.ToLowerInvariant()
    $groupLabel = $chapter

    $records.Add([ordered]@{
        id = "etymology-{0:0000}" -f $order
        collectionId = "etymology"
        term = $term
        meaning = $meaning
        derivatives = @()
        groupId = $groupId
        groupLabel = $groupLabel
        groupIndex = $groupIndex
        chapter = $chapter
        root = $root
        page = $null
        source = "DB_*.xlsx#vocab"
        order = $order
        searchText = Build-SearchText -Term $term -Meaning $meaning -Derivatives @() -Chapter $chapter -Root $root
      })
  }

  return Build-GroupedCollection `
    -CollectionId "etymology" `
    -Name "Etymology" `
    -Subtitle "Root-based track" `
    -Description "Word roots, prefixes, and chapter-based study bundles." `
    -ItemLabel "chapter" `
    -Records $records.ToArray()
}

$BasicPath = Resolve-DataFile -ExplicitPath $BasicPath -FilePattern "DB_comma_space_fixed.xlsx"
$AdvancedPath = Resolve-DataFile -ExplicitPath $AdvancedPath -FilePattern "DB-advanced.csv"
$EtymologyPath = Resolve-DataFile -ExplicitPath $EtymologyPath -FilePattern "DB_*.xlsx" -ExcludeName "DB_comma_space_fixed.xlsx"

$basic = Build-BasicCollection -Path $BasicPath
$advanced = Build-AdvancedCollection -Path $AdvancedPath
$etymology = Build-EtymologyCollection -Path $EtymologyPath

$database = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  totalRecords = $basic.totalRecords + $advanced.totalRecords + $etymology.totalRecords
  collections = @($basic, $advanced, $etymology)
  sources = @(
    [ordered]@{
      id = "basic-source"
      label = "Basic workbook"
      path = $BasicPath
      records = $basic.totalRecords
    },
    [ordered]@{
      id = "advanced-source"
      label = "Advanced csv"
      path = $AdvancedPath
      records = $advanced.totalRecords
    },
    [ordered]@{
      id = "etymology-source"
      label = "Etymology workbook"
      path = $EtymologyPath
      records = $etymology.totalRecords
    }
  )
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$json = $database | ConvertTo-Json -Depth 10
$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $encoding)

Write-Output ("sync-complete {0} records" -f $database.totalRecords)
foreach ($collection in $database.collections) {
  Write-Output ("- {0}: {1} records / {2} groups" -f $collection.name, $collection.totalRecords, $collection.totalGroups)
}
