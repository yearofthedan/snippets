---
description: Fires when an edit adds a comment, to check it against the comments rule
condition: '(?m)(^|\s)(//|/\*+)\s*(?!shortcut: |workaround: https?://|help: |@ts-expect-error|@type|oxlint-disable|eslint-disable)\S|(^|\s)#\s+(?!shortcut: |workaround: https?://|help: )\S'
scope: tool:edit, tool:write
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.cjs", "**/*.css", "**/*.sh", "**/*.py"]
---
You just wrote a comment without an allowed prefix. Read `rule://comments`: there is almost never a reason for one, and each reason has a counter. Remove it, or replace it with what the rule says instead.
