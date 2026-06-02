import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';

const { When, Then } = createBdd(test);

When(
  'I create a new board view named {string}',
  async ({ savedViews, scenarioContext, projectsAPI, sandbox, dataManager }, baseName: string) => {
    const currentViewName = `${baseName} ${Date.now()}`;
    scenarioContext.set('currentViewName', currentViewName);
    await savedViews.createBoardView(currentViewName);

    const views = await projectsAPI.getProjectViews(sandbox.projectId);
    const createdView = views.find((v) => v.name === currentViewName);
    if (createdView) {
      dataManager.enqueue(`delete view "${currentViewName}"`, async () => {
        await projectsAPI.deleteView(createdView.id);
      });
    } else {
      console.warn(
        `[cleanup] Could not find view "${currentViewName}" to enqueue cleanup — may need manual removal`,
      );
    }
  },
);

When(
  'I filter the current view by {string} with value {string}',
  async ({ savedViews }, _fieldName: string, value: string) => {
    await savedViews.applyStatusFilter(value);
  },
);

Then(
  'the current view should show filter {string} with value {string}',
  async ({ savedViews }, _fieldName: string, value: string) => {
    await savedViews.assertStatusFilterApplied(value);
  },
);

Then('the created view tab should be visible', async ({ savedViews, scenarioContext }) => {
  await savedViews.assertViewTabSelected(scenarioContext.get<string>('currentViewName'));
});

Then('the current view tab should be named {string}', async ({ savedViews }, viewName: string) => {
  await savedViews.assertViewTabSelected(viewName);
});

When('I reload the page', async ({ savedViews }) => {
  await savedViews.refreshView();
});

When('I switch to the {string} view', async ({ savedViews }, viewName: string) => {
  await savedViews.switchToView(viewName);
});
