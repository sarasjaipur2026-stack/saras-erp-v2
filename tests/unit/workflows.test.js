import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseDocument } from 'yaml'

const workflowsDir = new URL('../../.github/workflows/', import.meta.url)

test('GitHub Actions workflow files contain valid YAML', async () => {
  const files = (await readdir(workflowsDir)).filter(file => /\.ya?ml$/i.test(file))
  assert.ok(files.length > 0, 'expected at least one workflow')

  for (const file of files) {
    const source = await readFile(new URL(file, workflowsDir), 'utf8')
    const document = parseDocument(source)
    assert.deepEqual(document.errors, [], `${file} contains YAML errors`)
  }
})
