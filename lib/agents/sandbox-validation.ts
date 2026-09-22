import { Sandbox } from '@vercel/sandbox';
import type { GitHubDraft } from '../connectors/github-write';

export type SandboxValidation = {
  status: 'passed' | 'failed';
  summary: string;
  checks: { name: string; status: 'passed' | 'failed'; output: string }[];
  validated_at: string;
};

function cleanOutput(value: string) {
  return value
    .replace(/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9_.-]{20,})/gi, '[credential removed]')
    .replace(/https:\/\/x-access-token:[^@\s]+@github\.com/gi, 'https://github.com')
    .slice(-6000);
}

async function run(sandbox: Sandbox, cwd: string, name: string, cmd: string, args: string[]) {
  const result = await sandbox.runCommand({ cmd, args, cwd });
  const output = cleanOutput(`${await result.stdout()}\n${await result.stderr()}`.trim());
  return { name, status: result.exitCode === 0 ? 'passed' as const : 'failed' as const, output };
}

export async function validateDraftInSandbox(token: string, repository: string, draft: GitHubDraft): Promise<SandboxValidation> {
  const repoName = repository.split('/').pop()?.replace(/\.git$/i, '') || 'repo';
  const checks: SandboxValidation['checks'] = [];
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create({
      ...(!draft.emptyRepository?{source: { type: 'git' as const, url: `https://github.com/${repository}.git`, username: 'x-access-token', password: token, depth: 1 }}:{}),
      image: 'vercel/sandbox/universal:latest',
      timeout: 5 * 60 * 1000,
      resources: { vcpus: 2 },
      persistent: false,
      env: { CI: 'true' },
    });
    const cwd = `/vercel/sandbox/${repoName}`;
    if(draft.emptyRepository) await sandbox.runCommand('mkdir',['-p',cwd]);
    await sandbox.writeFiles(draft.files.map(file => ({ path: `${cwd}/${file.path}`, content: file.content })));

    const packageJson = await sandbox.readFileToBuffer({ path: `${cwd}/package.json` });
    if (!packageJson) {
      return { status: 'failed', summary: 'The repository has no supported JavaScript project manifest, so the generated code was not executed.', checks, validated_at: new Date().toISOString() };
    }
    const pkg = JSON.parse(packageJson.toString('utf8')) as { scripts?: Record<string,string> };
    const pnpmLock = await sandbox.readFileToBuffer({ path: `${cwd}/pnpm-lock.yaml` });
    const yarnLock = await sandbox.readFileToBuffer({ path: `${cwd}/yarn.lock` });
    const npmLock = await sandbox.readFileToBuffer({ path: `${cwd}/package-lock.json` });
    const install = pnpmLock
      ? await run(sandbox,cwd,'Install dependencies','pnpm',['install','--frozen-lockfile'])
      : yarnLock
        ? await run(sandbox,cwd,'Install dependencies','yarn',['install','--frozen-lockfile'])
        : await run(sandbox,cwd,'Install dependencies','npm',npmLock?['ci']:['install','--no-audit','--no-fund']);
    checks.push(install);
    if (install.status === 'failed') return { status:'failed', summary:'Dependency installation failed inside the isolated build environment.', checks, validated_at:new Date().toISOString() };

    const scripts = pkg.scripts ?? {};
    if (scripts.typecheck) checks.push(await run(sandbox,cwd,'Type check','npm',['run','typecheck']));
    if (scripts.test) checks.push(await run(sandbox,cwd,'Tests','npm',['run','test']));
    if (scripts.build) checks.push(await run(sandbox,cwd,'Production build','npm',['run','build']));
    if (checks.length === 1) return { status:'failed', summary:'Dependencies installed, but the repository has no build, test, or typecheck command to validate the change.', checks, validated_at:new Date().toISOString() };
    const failed = checks.filter(check => check.status === 'failed');
    return { status:failed.length?'failed':'passed', summary:failed.length?`${failed.length} isolated validation check${failed.length===1?'':'s'} failed.`:`All ${checks.length} isolated validation checks passed.`, checks, validated_at:new Date().toISOString() };
  } catch (error) {
    return { status:'failed', summary:error instanceof Error?`The isolated build could not complete: ${cleanOutput(error.message)}`:'The isolated build could not complete.', checks, validated_at:new Date().toISOString() };
  } finally {
    if (sandbox) await sandbox.stop().catch(()=>undefined);
  }
}
