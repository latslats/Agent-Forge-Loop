import { expect, test } from '@playwright/test'

const TEMPLATE = 'Support email triage'
const INPUT = 'Hi, when will my order ship?'

test('template agent: create, set model, publish, run with approval, eval, delete', async ({
  page,
}) => {
  await page.goto('/')

  // Create the agent from the built-in template. The app opens its page when it is created.
  await page.getByRole('button', { name: 'New agent', exact: true }).click()
  const newAgent = page.getByRole('dialog', { name: 'New agent' })
  await newAgent.getByRole('tab', { name: 'Template' }).click()
  await newAgent
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: TEMPLATE, exact: true }) })
    .getByRole('button', { name: 'Use template' })
    .click()
  await expect(page).toHaveURL(/\/agents\/[^/]+$/)

  // Agent settings show when no node is selected. Wait for the draft to save before publishing.
  await page.getByLabel('Model', { exact: true }).click()
  await page.getByRole('option', { name: 'Claude Haiku 5.5' }).click()
  await expect(page.getByLabel('Model', { exact: true })).toHaveText('Claude Haiku 5.5')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText(/^Published v\d+$/)).toBeVisible()

  // Run from the run console. The template pauses at a human review step, so approve it.
  const runConsole = page.getByRole('region', { name: 'Run console' })
  await runConsole.getByRole('button', { name: 'Run console' }).click()
  await runConsole.getByRole('textbox', { name: 'Run input' }).fill(INPUT)
  await runConsole.getByRole('button', { name: 'Run', exact: true }).click()
  await runConsole.getByRole('button', { name: 'Approve', exact: true }).click({ timeout: 60_000 })
  await expect(runConsole.getByText('Succeeded', { exact: true })).toBeVisible({
    timeout: 60_000,
  })

  // Evals: one dataset with one case that uses a contains scorer, then run it.
  await page.getByRole('tab', { name: 'Evals', exact: true }).click()
  const evals = page.getByRole('tabpanel', { name: 'Evals', exact: true })
  await evals.getByLabel('New dataset name').fill('Smoke')
  await evals.getByRole('button', { name: 'Create', exact: true }).click()

  await evals.getByRole('button', { name: 'Add case', exact: true }).click()
  const newCase = page.getByRole('dialog', { name: 'New case' })
  await newCase.getByLabel('Name', { exact: true }).fill('Order shipping question')
  await newCase.getByLabel('Input', { exact: true }).fill(INPUT)
  await newCase.getByLabel('Check', { exact: true }).click()
  await page.getByRole('option', { name: 'Contains text' }).click()
  await newCase.getByLabel('Text to find').fill('order')
  await newCase.getByRole('button', { name: 'Add scorer' }).click()
  await newCase.getByRole('button', { name: 'Save case' }).click()
  await expect(newCase).toBeHidden()

  await evals.getByRole('button', { name: 'Run evals', exact: true }).click()
  await expect(evals.getByText('Succeeded', { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  })

  // Delete the agent from its page menu. The app returns to the agents list.
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete agent' }).click()
  const confirm = page.getByRole('dialog', { name: /^Delete / })
  await confirm.getByRole('button', { name: 'Delete agent', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})
