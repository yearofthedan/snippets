type Command = { words: string[]; targets: string[] };
type Heredoc = { word: string; tabs: boolean };

/* shortcut: a target or a file argument holding `$` or a backtick is neither refused nor followed,
   since resolving it means running the shell; read it once a session is seen to write through one. */
export const UNRESOLVED = /[`$]/;

const commandsIn = (line: string): Command[] => {
  const commands: Command[] = [];
  const heredocs: Heredoc[] = [];
  let command: Command = { words: [], targets: [] };
  let word = '';
  let quote = '';
  let dropped = false;
  let target = false;
  let processSubstitution = false;
  const endWord = () => {
    if (word === '') return;
    if (!dropped) command.words.push(word);
    else if (target && !processSubstitution && !UNRESOLVED.test(word)) command.targets.push(word);
    word = '';
    dropped = false;
    target = false;
    processSubstitution = false;
  };
  const endCommand = () => {
    endWord();
    commands.push(command);
    command = { words: [], targets: [] };
    dropped = false;
    target = false;
    processSubstitution = false;
  };
  const afterBlanks = (from: number): number => {
    let at = from;
    while (line[at] === ' ' || line[at] === '\t') at += 1;
    return at;
  };
  const wordAfterBlanks = (from: number): string => {
    let at = afterBlanks(from);
    let wordAfter = '';
    while (at < line.length && !/[\s;|&<>()]/.test(line[at] as string)) {
      wordAfter += line[at];
      at += 1;
    }
    return wordAfter;
  };
  const delimiterAfter = (from: number): string => {
    let at = afterBlanks(from);
    let delimiter = '';
    let quoted = '';
    for (; at < line.length; at += 1) {
      const character = line[at] as string;
      if (quoted !== '') {
        if (character === quoted) quoted = '';
        else delimiter += character;
      } else if (character === '"' || character === "'") {
        quoted = character;
      } else if (character === '\\') {
        at += 1;
        delimiter += line[at] ?? '';
      } else if (/[\s;|&<>]/.test(character)) {
        break;
      } else {
        delimiter += character;
      }
    }
    return delimiter;
  };
  const bodyEnd = (from: number, heredoc: Heredoc): number => {
    let at = line.indexOf('\n', from);
    while (at !== -1) {
      const next = line.indexOf('\n', at + 1);
      const body = line.slice(at + 1, next === -1 ? line.length : next);
      const terminator = heredoc.tabs ? body.replace(/^\t+/, '') : body;
      if (terminator === heredoc.word) return next === -1 ? line.length : next;
      at = next;
    }
    return line.length;
  };
  const operatorEnd = (
    index: number,
  ): { at: number; writes: boolean; heredoc: boolean; tabs: boolean } => {
    const ampersand = line[index] === '&';
    const start = ampersand ? index + 1 : index;
    const writes = line[start] === '>';
    const doubled = line[start + 1] === line[start];
    let at = doubled ? start + 2 : start + 1;
    const heredoc = line[start] === '<' && doubled && !ampersand;
    const tabs = heredoc && line[at] === '-';
    if (tabs) at += 1;
    const copy = !ampersand && line[at] === '&' && /^[0-9-]+$/.test(wordAfterBlanks(at + 1));
    if (line[at] === '|' || line[at] === '&') at += 1;
    return { at, writes: writes && !copy, heredoc, tabs };
  };
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] as string;
    if (quote !== '') {
      if (character === quote) quote = '';
      else word += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (
      character === '>' ||
      character === '<' ||
      (character === '&' && line[index + 1] === '>')
    ) {
      if (/^[0-9]+$/.test(word)) word = '';
      else endWord();
      const operator = operatorEnd(index);
      if (operator.heredoc) {
        const delimiter = delimiterAfter(operator.at);
        if (delimiter !== '') heredocs.push({ word: delimiter, tabs: operator.tabs });
      }
      index = operator.at - 1;
      dropped = true;
      target = operator.writes;
      processSubstitution = line[operator.at] === '(';
    } else if (character === '&' || character === '|' || character === ';') {
      endCommand();
    } else if (character === '\\' && line[index + 1] === '\n') {
      endWord();
      index += 1;
    } else if (character === '\n') {
      endCommand();
      if (heredocs.length > 0) {
        let at = index;
        while (heredocs.length > 0) at = bodyEnd(at, heredocs.shift() as Heredoc);
        index = at - 1;
      }
    } else if (/\s/.test(character)) {
      endWord();
    } else {
      word += character;
    }
  }
  endCommand();
  return commands;
};

/* shortcut: escapes, `$(…)` and `bash -c` hide a command from the callers of `wordsPerCommand`, which
   read its words; a `<<` inside `$((…))` is read as a heredoc, so it skips the rest of the input; and
   a process substitution of more than one word, such as `>(grep foo)`, is read as files, so it refuses
   rather than letting a write through; read a hidden command once a session is seen to use one. */
export const wordsPerCommand = (line: string): string[][] =>
  commandsIn(line)
    .map(({ words }) => words)
    .filter((words) => words.length > 0);

export const writeTargetsPerCommand = (line: string): string[][] =>
  commandsIn(line)
    .map(({ targets }) => targets)
    .filter((targets) => targets.length > 0);
