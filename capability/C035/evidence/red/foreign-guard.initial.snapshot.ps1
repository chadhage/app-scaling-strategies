function Invoke-C035ForeignPreserved([string]$Repository, [ScriptBlock]$Operation) {
    return [ordered]@{result=(& $Operation);preserved=$true}
}
