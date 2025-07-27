import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { addActorCommand } from './commands/add-actor';
import { buildCommand } from './commands/build';
import { deployCommand } from './commands/deploy';
import { testCommand } from './commands/test';
import { analyzeCommand } from './commands/analyze';
import { generateCommand } from './commands/generate';

const program = new Command();

program
  .name('relay')
  .description('CLI for Actor-Agent Development Platform')
  .version('1.0.0');

program.addCommand(initCommand);
program.addCommand(addActorCommand);
program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(testCommand);
program.addCommand(analyzeCommand);
program.addCommand(generateCommand);

program.parse(process.argv);