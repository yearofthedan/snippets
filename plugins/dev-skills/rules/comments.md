---
alwaysApply: true
---
# Comments

There is almost never a reason for a comment. Each reason to write one has a counter:

- **"The code isn't clear without it."** Split a module that isn't cohesive; extract smaller functions, move to a functional style or invert control where a function is too complex; rename what isn't named for what it does.
- **"It protects a behaviour or a standard from being undone."** What matters is tested, so the comment marks a missing test.
- **"It explains odd behaviour in a library or the platform."** Put the library behind an adapter and test it there; where there is no adapter, as in a shell script or a platform fact, test the behaviour.

A comment is allowed only when it starts with one of these, after the comment marker:

- `shortcut: <the limit>, <when to upgrade>`, for a known limit;
- `workaround: <issue link>`, for code patching a bug in a library or the platform;
- a comment a tool reads: a directive such as `@ts-expect-error` or a lint disable, or text a tool prints, such as the summary a task runner shows beside each task.

A `//` or `#` comment is one line; a longer one is a `/* … */` block.

The same holds in configuration files: a comment on a setting becomes a better name, a `shortcut:`, or goes, since the reason for a value is in the history of the change that set it.
