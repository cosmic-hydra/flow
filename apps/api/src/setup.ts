export type SetupOs = 'macos' | 'windows' | 'linux' | 'unknown';

export function detectOsFromUserAgent(userAgent: string | undefined): SetupOs {
  if (userAgent === undefined || userAgent.trim() === '') return 'unknown';
  if (/Mac OS X|Macintosh/iu.test(userAgent)) return 'macos';
  if (/Windows/iu.test(userAgent)) return 'windows';
  if (/Linux|X11/iu.test(userAgent)) return 'linux';
  return 'unknown';
}

export function buildSetupCommands(os: Exclude<SetupOs, 'unknown'>): Record<string, string> {
  if (os === 'windows') {
    return {
      node: 'winget install OpenJS.NodeJS.LTS',
      postgres: 'winget install PostgreSQL.PostgreSQL',
      webcmd: 'npm install -g @agentrhq/webcmd',
      doctor: 'webcmd doctor',
      districtLogin: 'webcmd --profile flow district login --window foreground',
      composio: 'npm install -g @composio/cli && composio login',
      flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && copy .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
    };
  }
  if (os === 'macos') {
    return {
      node: 'brew install node',
      postgres: 'brew install postgresql@16 && brew services start postgresql@16',
      webcmd: 'npm install -g @agentrhq/webcmd',
      doctor: 'webcmd doctor',
      districtLogin: 'webcmd --profile flow district login --window foreground',
      composio: 'npm install -g @composio/cli && composio login',
      flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
    };
  }
  return {
    node: 'sudo apt update && sudo apt install -y nodejs npm',
    postgres: 'sudo apt install -y postgresql postgresql-client',
    webcmd: 'npm install -g @agentrhq/webcmd',
    doctor: 'webcmd doctor',
    districtLogin: 'webcmd --profile flow district login --window foreground',
    composio: 'npm install -g @composio/cli && composio login',
    flow: 'git clone https://github.com/cosmic-hydra/flow.git && cd flow && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev',
  };
}
