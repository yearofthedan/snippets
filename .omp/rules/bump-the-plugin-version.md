---
description: Fires when an edit touches the dev-skills plugin, to bump its version in the same commit
condition: '.'
scope: tool:edit, tool:write
globs: ["plugins/dev-skills/**"]
---
This edit changes the dev-skills plugin. Bump `version` in `plugins/dev-skills/package.json` in the same commit: the minor number for a new skill, rule or extension, the patch number for a fix. Installs report that version, so an unbumped change looks like the one before it.
