import { applySubmittalWorkflow, hydrateSubmittalRevisionCoverage, isSubmittalWorkflowPatch, validateSubmittalCreate } from './submittalWorkflow';
import { addAliases, cleanRecord } from './fieldMapping';
import type { EntityClient, RowWithAliases } from './supabaseTypes';

/** Legacy UI/import entrypoints cannot manufacture a submitted drawing record. */
export function withSubmittalLifecycle<T extends EntityClient<'submittals'>>(base: T): T {
  const create: T['create'] = async (record, options) => {
    validateSubmittalCreate(record as Record<string, unknown>);
    return base.create(record, options);
  };
  const update: T['update'] = async (id, updates, options) => {
    const patch = cleanRecord(updates as Record<string, unknown>);
    if (!isSubmittalWorkflowPatch(patch)) return base.update(id, updates, options);
    const review = options?.submittalReview;
    if (!review || review.id !== id) throw new Error('Review this submittal in its status workflow before changing submission, approval or revision evidence.');
    // Form payloads carry unchanged lifecycle values. They are metadata edits,
    // not a second approval; never manufacture a workflow from identical fields.
    for (const key of Object.keys(patch)) {
      if (JSON.stringify(patch[key]) === JSON.stringify((review as unknown as Record<string, unknown>)[key])) delete patch[key];
    }
    if (!isSubmittalWorkflowPatch(patch)) return base.update(id, patch, options);
    // Keep the reviewed snapshot identical on retry. A fresh read here would
    // reject the committed version before the server could replay its receipt.
    const coverage = review.revision_coverage;
    if ((review.submittal_type ?? 'Shop Drawing') === 'Shop Drawing' && !coverage) throw new Error('Reload this submittal and review its exact revision evidence before saving.');
    const result = await applySubmittalWorkflow({ review, revisionIds: coverage?.current_revision_ids ?? [], patch, client: options?.client, requestId: options?.clientOperationId });
    return addAliases(result.submittal as RowWithAliases<'submittals'>, 'submittals');
  };
  return { ...base, create, update,
    list: async (...args) => hydrateSubmittalRevisionCoverage(await base.list(...args)),
    listAll: async (...args) => hydrateSubmittalRevisionCoverage(await base.listAll(...args)),
    filter: async (...args) => hydrateSubmittalRevisionCoverage(await base.filter(...args)),
    filterAll: async (...args) => hydrateSubmittalRevisionCoverage(await base.filterAll(...args)),
    get: async (id, options) => (await hydrateSubmittalRevisionCoverage([await base.get(id, options)], options?.client))[0],
    bulkCreate: async (records) => { for (const record of records) validateSubmittalCreate(record as Record<string, unknown>); return base.bulkCreate(records); },
    bulkUpdate: async (ids, patch) => {
      if (isSubmittalWorkflowPatch(patch as Record<string, unknown>)) throw new Error('Review each submittal before changing its submission or approval workflow.');
      return base.bulkUpdate(ids, patch);
    },
  };
}
