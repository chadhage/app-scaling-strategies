'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.join(__dirname, '..', 'publication', 'transport.ps1').replaceAll("'", "''");
function check(body) {
  const prefix = `$ErrorActionPreference='Stop';. '${script}';`
    + "$a=@{approvedBy='parent-controller';mode='publisher-process-local HTTP/1.1';privatePublisherSha256Unchanged=('0'*64);"
    + 'namespaceClassAdminHeadWhitespaceAndCreditRulesUnchanged=$true;sourceAndIndexChanges=0;extraCredits=0};'
    + 'function Assert($value){if(-not $value){throw \'Synthetic process-local transport assertion failed.\'}};';
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/i.test(key)) delete env[key];
  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', prefix + body], {
    env, encoding: 'utf8', maxBuffer: 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr);
}

test('missing count appends exact HTTP1.1 in the same process and restores missing entries finally', () => {
  check("$r=Enable-GitHttp11 $a ('0'*64);try{Assert ($env:GIT_CONFIG_COUNT -eq '1');Assert ((git config --get http.version) -eq 'HTTP/1.1')}"
    + "finally{Restore-GitHttp11 $r};Assert (-not (Get-GitProcessEntry 'GIT_CONFIG_COUNT').present);"
    + "Assert (-not (Get-GitProcessEntry 'GIT_CONFIG_KEY_0').present);Assert (-not (Get-GitProcessEntry 'GIT_CONFIG_VALUE_0').present);"
    + "$null=git config --get http.version;Assert ($LASTEXITCODE -in @(0,1));");
});

test('prior entries and ignored next-slot values survive append and an exception without global config changes', () => {
  check("$env:GIT_CONFIG_COUNT='2';$env:GIT_CONFIG_KEY_0='user.name';$env:GIT_CONFIG_VALUE_0='synthetic fixture';"
    + "$env:GIT_CONFIG_KEY_1='http.version';$env:GIT_CONFIG_VALUE_1='HTTP/2';"
    + "$env:GIT_CONFIG_KEY_2='ignored.fixture';$env:GIT_CONFIG_VALUE_2='old ignored slot';"
    + "$r=Enable-GitHttp11 $a ('0'*64);try{Assert ($env:GIT_CONFIG_COUNT -eq '3');"
    + "Assert ($env:GIT_CONFIG_VALUE_0 -eq 'synthetic fixture');Assert ((git config --get http.version) -eq 'HTTP/1.1');"
    + "throw 'Declared fixture failure'}catch{}finally{Restore-GitHttp11 $r};"
    + "Assert ($env:GIT_CONFIG_COUNT -eq '2');Assert ($env:GIT_CONFIG_KEY_2 -eq 'ignored.fixture');"
    + "Assert ($env:GIT_CONFIG_VALUE_2 -eq 'old ignored slot');Assert ((git config --get http.version) -eq 'HTTP/2');");
});

test('malformed, padded, negative and unbounded counts fail without silent defaults or mutation', () => {
  check("foreach($v in @('','x','-1','01','1.0',' 1','1 ','1024','2147483647')){"
    + "Set-Item Env:GIT_CONFIG_COUNT $v;$before=Get-GitProcessEntry 'GIT_CONFIG_COUNT';$failed=$false;"
    + "try{$r=Enable-GitHttp11 $a ('0'*64)}catch{$failed=$true};Assert $failed;"
    + "Assert ((Get-GitProcessEntry 'GIT_CONFIG_COUNT').value -ceq $before.value);"
    + "Assert (-not (Get-GitProcessEntry 'GIT_CONFIG_KEY_0').present)};");
});

test('empty ignored slot restoration is exact and missing declared entries or unapproved transport fail closed', () => {
  check("$env:GIT_CONFIG_KEY_0='';$env:GIT_CONFIG_VALUE_0='';"
    + "$beforeKey=Get-GitProcessEntry 'GIT_CONFIG_KEY_0';$beforeValue=Get-GitProcessEntry 'GIT_CONFIG_VALUE_0';"
    + "$r=Enable-GitHttp11 $a ('0'*64);Restore-GitHttp11 $r;"
    + "Assert ((Get-GitProcessEntry 'GIT_CONFIG_KEY_0').present -eq $beforeKey.present);"
    + "Assert ((Get-GitProcessEntry 'GIT_CONFIG_VALUE_0').value -ceq $beforeValue.value);"
    + "$env:GIT_CONFIG_COUNT='1';Remove-Item Env:GIT_CONFIG_KEY_0 -ErrorAction SilentlyContinue;$failed=$false;"
    + "try{$r=Enable-GitHttp11 $a ('0'*64)}catch{$failed=$true};Assert $failed;"
    + "$a.mode='global';$failed=$false;try{$r=Enable-GitHttp11 $a ('0'*64)}catch{$failed=$true};Assert $failed;");
});
