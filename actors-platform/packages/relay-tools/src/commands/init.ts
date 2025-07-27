import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export const initCommand = new Command('init')
  .description('Initialize a new actor-based project')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Project template', 'default')
  .action(async (name, options) => {
    const spinner = ora();

    try {
      // Prompt for project details
      const answers = await prompts([
        {
          type: name ? null : 'text',
          name: 'projectName',
          message: 'Project name:',
          initial: name || 'my-actor-app',
        },
        {
          type: 'text',
          name: 'description',
          message: 'Project description:',
          initial: 'An actor-based application',
        },
        {
          type: 'multiselect',
          name: 'actors',
          message: 'Select core actors to include:',
          choices: [
            { title: 'User Authentication', value: 'user-auth', selected: true },
            { title: 'Stripe Billing', value: 'stripe-billing' },
            { title: 'Notifications', value: 'notifications' },
            { title: 'Analytics', value: 'analytics' },
          ],
          min: 1,
        },
        {
          type: 'select',
          name: 'deploymentTarget',
          message: 'Primary deployment target:',
          choices: [
            { title: 'Vercel', value: 'vercel' },
            { title: 'Kubernetes', value: 'kubernetes' },
            { title: 'Both', value: 'both' },
          ],
          initial: 0,
        },
      ]);

      const projectName = answers.projectName || name;
      const projectPath = join(process.cwd(), projectName);

      spinner.start(`Creating project ${chalk.cyan(projectName)}...`);

      // Create project directory
      mkdirSync(projectPath, { recursive: true });

      // Create package.json
      const packageJson = {
        name: projectName,
        version: '0.1.0',
        description: answers.description,
        private: true,
        scripts: {
          dev: 'relay dev',
          build: 'relay build',
          test: 'relay test',
          deploy: 'relay deploy',
          'add-actor': 'relay add-actor',
        },
        dependencies: {
          '@actors-platform/sdk': '^1.0.0',
          '@actors-platform/relay': '^1.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
        },
      };

      writeFileSync(
        join(projectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create relay.config.json
      const relayConfig = {
        name: projectName,
        actors: answers.actors.reduce((acc: any, actor: string) => {
          acc[actor] = {
            version: 'latest',
            config: {},
          };
          return acc;
        }, {}),
        deployment: {
          target: answers.deploymentTarget,
          vercel: answers.deploymentTarget !== 'kubernetes' ? {
            projectName,
            framework: 'nextjs',
          } : undefined,
          kubernetes: answers.deploymentTarget !== 'vercel' ? {
            namespace: projectName,
            replicas: 2,
          } : undefined,
        },
      };

      writeFileSync(
        join(projectPath, 'relay.config.json'),
        JSON.stringify(relayConfig, null, 2)
      );

      // Create TypeScript config
      const tsConfig = {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          lib: ['ES2022'],
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          moduleResolution: 'node',
          allowJs: true,
          noEmit: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      };

      writeFileSync(
        join(projectPath, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2)
      );

      // Create src directory and entry point
      mkdirSync(join(projectPath, 'src'), { recursive: true });
      
      const appContent = `import { createApp } from '@actors-platform/sdk';

const app = createApp({
  name: '${projectName}',
  actors: [
${answers.actors.map((actor: string) => `    '${actor}',`).join('\\n')}
  ],
});

app.start().then(() => {
  console.log('🚀 Application started successfully');
}).catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
`;

      writeFileSync(join(projectPath, 'src', 'index.ts'), appContent);

      // Create .gitignore
      const gitignore = `node_modules/
dist/
.env
.env.local
.env.*.local
.DS_Store
*.log
.turbo/
.vercel/
coverage/
`;

      writeFileSync(join(projectPath, '.gitignore'), gitignore);

      spinner.succeed(`Project ${chalk.cyan(projectName)} created successfully!`);

      // Install dependencies
      spinner.start('Installing dependencies...');
      execSync('npm install', { cwd: projectPath, stdio: 'ignore' });
      spinner.succeed('Dependencies installed');

      // Initialize git
      spinner.start('Initializing git repository...');
      execSync('git init', { cwd: projectPath, stdio: 'ignore' });
      execSync('git add .', { cwd: projectPath, stdio: 'ignore' });
      execSync('git commit -m "Initial commit"', { cwd: projectPath, stdio: 'ignore' });
      spinner.succeed('Git repository initialized');

      console.log('');
      console.log(chalk.green('✨ Your project is ready!'));
      console.log('');
      console.log('Next steps:');
      console.log(chalk.cyan(`  cd ${projectName}`));
      console.log(chalk.cyan('  npm run dev'));
      console.log('');
      console.log('Available commands:');
      console.log('  npm run dev        - Start development server');
      console.log('  npm run build      - Build for production');
      console.log('  npm run test       - Run tests');
      console.log('  npm run deploy     - Deploy to configured platform');
      console.log('  npm run add-actor  - Add a new actor to your project');
      console.log('');
    } catch (error) {
      spinner.fail('Failed to create project');
      console.error(error);
      process.exit(1);
    }
  });