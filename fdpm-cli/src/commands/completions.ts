import { Command } from "commander";
import {
  type CommandMetadataMap,
  NO_PROJECT_ARGV,
  NO_PROJECT_JSON,
} from "./metadata.js";

const TOP_LEVEL_COMMANDS = [
  "version",
  "health",
  "profile",
  "project",
  "primitive",
  "relation",
  "structure",
  "edit",
  "template",
  "test-suite",
  "transfer",
  "log",
  "plugin",
  "render",
  "validate",
  "diff",
  "migrate",
  "completions",
] as const;

const GLOBAL_FLAGS = [
  "--help",
  "-h",
  "--version",
  "-V",
  "--data-dir",
  "--no-persist",
  "--verbose",
  "--quiet",
  "--log-level",
] as const;

const COMMAND_SUBCOMMANDS: Record<string, readonly string[]> = {
  health: ["liveness", "healthz", "readiness", "readyz"],
  project: ["list", "get", "create", "delete"],
  primitive: ["list", "get", "cite", "search", "create", "replace", "patch", "delete", "field-patch"],
  relation: ["list", "get", "search", "create", "replace", "patch", "delete", "field-patch"],
  structure: ["membership", "tree", "reorder", "reparent"],
  edit: ["batch", "print-schema"],
  template: ["list", "create", "apply", "delete"],
  "test-suite": ["list", "create", "run"],
  transfer: ["export", "import"],
  log: ["list", "undo", "rebuild"],
  plugin: ["list", "enable", "disable", "inspect"],
  render: [],
  validate: [],
  diff: [],
  migrate: ["normalize-metadata"],
  completions: ["bash", "zsh", "fish", "powershell"],
};

export function renderRootOnboarding(): string {
  return [
    "FDPM — typed project graph CLI for profiles, primitives, relations, validation, and rendering.",
    "",
    "Common commands:",
    "  fdpm health liveness",
    "  fdpm project list",
    "  fdpm validate <project>",
    "  fdpm render <project> text/markdown --renderer-id spec:SpecMarkdownRenderer",
    "",
    "Next steps:",
    "  Run `fdpm --help` for the full command surface.",
    "  Run `fdpm completions <bash|zsh|fish|powershell>` to install shell completion.",
  ].join("\n");
}

export function renderRootAfterHelp(): string {
  return [
    "",
    "Examples:",
    "  fdpm health liveness",
    "  fdpm project list",
    "  fdpm validate spec-render-dsl",
    "  fdpm render spec-render-dsl text/markdown --renderer-id spec:SpecMarkdownRenderer",
    "",
    "Shell completions:",
    "  fdpm completions bash",
  ].join("\n");
}

export function buildCompletionsCommand(): Command {
  const cmd = new Command("completions");
  cmd
    .description("Generate a shell completion script for fdpm")
    .argument("<shell>", "target shell: bash | zsh | fish | powershell")
    .action((shell: string) => {
      const script = renderCompletionScript(shell);
      process.stdout.write(script);
    });
  return cmd;
}

function renderCompletionScript(shell: string): string {
  switch (shell) {
    case "bash":
      return renderBashCompletion();
    case "zsh":
      return renderZshCompletion();
    case "fish":
      return renderFishCompletion();
    case "powershell":
      return renderPowerShellCompletion();
    default:
      throw new Error(`unsupported shell: ${shell} (expected bash, zsh, fish, or powershell)`);
  }
}

function renderBashCompletion(): string {
  return `# fdpm bash completion
_fdpm_completions() {
  local cur prev words cword
  _init_completion || return
  local commands="${TOP_LEVEL_COMMANDS.join(" ")}"
  local globals="${GLOBAL_FLAGS.join(" ")}"
  case "\${words[1]-}" in
${Object.entries(COMMAND_SUBCOMMANDS)
  .map(([name, subs]) =>
    subs.length > 0
      ? `    ${name}) COMPREPLY=( $(compgen -W "${subs.join(" ")}" -- "$cur") ); return ;;`
      : "",
  )
  .filter(Boolean)
  .join("\n")}
  esac
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands $globals" -- "$cur") )
    return
  fi
  COMPREPLY=( $(compgen -W "$globals" -- "$cur") )
}
complete -F _fdpm_completions fdpm
`;
}

export const commandMetadata: CommandMetadataMap = {
  completions: {
    readOnly: true,
    projectIdsFromArgv: NO_PROJECT_ARGV,
    projectIdsFromJson: NO_PROJECT_JSON,
  },
};

function renderZshCompletion(): string {
  const commandSpecs = TOP_LEVEL_COMMANDS.map((name) => `"${name}:${name}"`).join(" \\\n  ");
  const cases = Object.entries(COMMAND_SUBCOMMANDS)
    .filter(([, subs]) => subs.length > 0)
    .map(
      ([name, subs]) =>
        `    ${name}) _values 'fdpm ${name}' ${subs.map((sub) => `"${sub}:${sub}"`).join(" ")} ;;`,
    )
    .join("\n");
  return `#compdef fdpm
_fdpm() {
  local -a commands
  commands=(
  ${commandSpecs}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  case "$words[2]" in
${cases}
  esac
}
_fdpm "$@"
`;
}

function renderFishCompletion(): string {
  const lines = [
    "# fdpm fish completion",
    "complete -c fdpm -f",
    ...TOP_LEVEL_COMMANDS.map((name) => `complete -c fdpm -n '__fish_use_subcommand' -a '${name}'`),
  ];
  for (const [name, subs] of Object.entries(COMMAND_SUBCOMMANDS)) {
    for (const sub of subs) {
      lines.push(`complete -c fdpm -n '__fish_seen_subcommand_from ${name}' -a '${sub}'`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderPowerShellCompletion(): string {
  const top = TOP_LEVEL_COMMANDS.map((name) => `        [CompletionResult]::new('${name}','${name}','ParameterValue','${name}')`).join(",\n");
  const blocks = Object.entries(COMMAND_SUBCOMMANDS)
    .filter(([, subs]) => subs.length > 0)
    .map(([name, subs]) => {
      const values = subs
        .map((sub) => `        [CompletionResult]::new('${sub}','${sub}','ParameterValue','${sub}')`)
        .join(",\n");
      return `    '${name}' { @(\n${values}\n    ) }`;
    })
    .join("\n");
  return `Register-ArgumentCompleter -Native -CommandName fdpm -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = $commandAst.CommandElements | ForEach-Object { $_.Extent.Text }
  if ($words.Count -le 2) {
    @(
${top}
    ) | Where-Object { $_.CompletionText -like "$wordToComplete*" }
    return
  }
  switch ($words[1]) {
${blocks}
  }
}
`;
}
