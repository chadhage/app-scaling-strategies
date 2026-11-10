Feature: C014 keep management secrets server-side and redact public evidence
  A synthetic loopback service HOLDS fictional canary secrets and fictional PII (management tokens, a signing key, a connection string,
  a service credential, contacts with names, e-mail addresses and phone numbers) and SERVES public evidence (trace, runs, audit, logs, an
  export bundle, error answers, an inspection page). Every public JSON byte is produced by ONE redaction function: an allow-list of
  fields with closed vocabularies, plus masking by value (every configured secret in every covered encoding) and by shape.
  Nothing here is real: no credential, no person, no cloud, no persistence.

  Background:
    Given a service built on the accepted C009 authorization fixture with seeded canaries in its management configuration

  Scenario: secrets are used only on the server
    When an operator reads the evidence bundle
    Then its signature is an HMAC-SHA256 of the public bundle bytes made with the signing key
    And no byte of the signing key, a token, the connection string, the service credential or a contact detail is in any answer

  Scenario Outline: the canary sweep finds nothing in any byte that left the server
    Given every canary is planted in "<place>"
    When every route is called as every identity: anonymous, visitor, conductor-a, conductor-b, operator, forged, expired and malformed tokens
    Then no canary appears in the status line, headers, body, console or log output, in any covered encoding
    Examples:
      | place |
      | the management configuration |
      | request headers, URL, query and bodies |
      | command inputs |
      | run records, trace fields, audit entries and log lines |
      | error causes and thrown exceptions with stack text |
      | file names, nested arrays and object keys |

  Scenario Outline: every covered encoding of a canary is masked
    Given a canary in the free text of public evidence as "<encoding>"
    Then the answer holds no byte of that canary in any covered encoding, also when the answer is read in one-byte chunks
    Examples:
      | encoding |
      | raw, upper and lower case |
      | URL, double URL and every-byte percent encoding |
      | base64 and base64url at all three alignments |
      | hex in lower and upper case |
      | JSON \u escapes, HTML decimal and hexadecimal entities |
      | full-width and other NFKC variants |
      | zero-width and other format characters between its characters |

  Scenario: public evidence is an allow-list
    Then a field no rule names is dropped, an enum, id, integer or hex field outside its closed vocabulary is masked, and a key is never passed through
    And a client-supplied string (header, URL, query, body, command name) never appears in a public answer

  Scenario: errors and exceptions
    When a management command fails with an exception whose message, cause and stack carry the connection string and the credential
    Then the public answer is a typed refusal with a fixed message and the public trace holds only masked text

  Scenario: no secret in a URL, a Referer, a cache header, a CORS allow list, a cookie, a source map or a comment
    Then every answer says Cache-Control no-store, sets no cookie, has no Access-Control-Allow-Origin and no source map, and the page assets hold none

  Scenario: every refusal ends the connection and nothing runs behind it
    When a request is refused as the first, a later or an asynchronous request of a connection, with any number of legitimate requests before or after it
    Then the typed answer closes the connection and a valid mutation pipelined behind the refusal does not apply

  Scenario: the inspection page
    Then it validates every document, prints no server prose, reconciles shown against total, and its real Edge DOM, storage, cookies, console and network hold no canary

  Scenario: the redaction function is guarded by named tests
    Then dropping a field rule, skipping nested arrays, keys, errors or the export path, or removing value masking, fails a named test

  Scenario: a seeded random sequence of plant, call, export and recover operations
    Then after every operation the set of bytes served publicly contains no canary in any covered encoding
