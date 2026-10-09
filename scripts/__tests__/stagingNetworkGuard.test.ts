import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, STAGING_ORIGIN, allowsStagingBrowserRequest as allows } from '../../e2e/stagingNetworkGuard.js';

describe('shared staging browser policy', () => {
  it.each([
    [APP_ORIGIN + '/assets/app.js', 'GET'], [APP_ORIGIN + '/Drawings', 'HEAD'],
    [STAGING_ORIGIN + '/rest/v1/projects?select=id', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/projects?select=id', 'HEAD'],
    [STAGING_ORIGIN + '/rest/v1/drawings?project_id=eq.fixture', 'OPTIONS'],
    [STAGING_ORIGIN + '/auth/v1/user', 'GET'],
    [STAGING_ORIGIN + '/auth/v1/token?grant_type=refresh_token', 'POST'],
    ...['get_my_project_role', 'get_submittal_revision_coverage', 'get_submittal_revision_coverages']
      .map(name => [STAGING_ORIGIN + '/rest/v1/rpc/' + name, 'POST']),
    ['https://fonts.googleapis.com/css2?family=Inter', 'GET'],
    ['https://fonts.gstatic.com/font.woff2', 'GET'],
  ])('allows an explicit read or session refresh: %s %s', (url, method) => expect(allows(url, method)).toBe(true));

  it.each([
    [APP_ORIGIN + '/email', 'POST'], ['https://api.stripe.com/v1/customers', 'GET'],
    ['https://kjrwqagyeswwoxpjkcko.supabase.co/rest/v1/projects', 'GET'],
    [STAGING_ORIGIN + '/functions/v1/stripe-billing', 'GET'],
    [STAGING_ORIGIN + '/functions/v1/email-send', 'POST'],
    [STAGING_ORIGIN + '/rest/v1/projects', 'PATCH'],
    [STAGING_ORIGIN + '/rest/v1/projects', 'DELETE'],
    [STAGING_ORIGIN + '/rest/v1/rpc/apply_submittal_round_workflow', 'POST'],
    [STAGING_ORIGIN + '/rest/v1/rpc/get_my_project_role', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/rpc/get_my_project_role?override=1', 'POST'],
    [STAGING_ORIGIN + '/storage/v1/object/app-files/test', 'GET'],
    [STAGING_ORIGIN + '/auth/v1/token?grant_type=password', 'POST'],
    [STAGING_ORIGIN + '/auth/v1/logout', 'POST'],
    [STAGING_ORIGIN + '/auth/v1/user', 'PUT'],
    [STAGING_ORIGIN + '/rest/v1/projects%2frpc', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/projects#fragment', 'GET'],
    ['https://user:password@ndyfjffsulfbwpmwdmic.supabase.co/rest/v1/projects', 'GET'],
    ['not a URL', 'GET'], ['https://fonts.gstatic.com/font', 'POST'],
  ])('rejects unapproved egress: %s %s', (url, method) => expect(allows(url, method)).toBe(false));
});
