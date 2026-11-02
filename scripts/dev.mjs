// Starts the API server and the Vite dev server together. Ctrl-C stops both.
import { spawn } from 'node:child_process'

const procs = [
  ['server', ['run', 'dev', '-w', 'apps/server']],
  ['web', ['run', 'dev', '-w', 'apps/web']],
].map(([name, args]) => {
  const child = spawn('npm', args, { stdio: 'inherit' })
  child.on('exit', (code) => console.log(`[${name}] exited with ${code ?? 'signal'}`))
  return child
})

process.on('SIGINT', () => {
  for (const child of procs) child.kill('SIGINT')
  process.exit(0)
})
