# unclassified

Report a module that matches no kind.

## Why

Every other rule is set per kind, so a module without a kind is checked against nothing. New folders would otherwise
slip past the architecture silently. Reporting them makes the config cover the whole codebase, and makes each new
place for code a decision.

## Rule details

This comes from the model rather than a rule, and cannot be turned off. A module is unclassified when no kind's
`match` glob fits it and `exclude` does not remove it.

With this config, `src/stray.ts` is reported:

```json
{
  "kinds": {
    "domain": { "match": "src/domain/**" },
    "app": { "match": "src/app/**" }
  }
}
```

Fix it by adding a glob that covers the file to a kind, moving the file under an existing kind, or adding it to
`exclude` if it should not be checked at all.

## Options

None.
