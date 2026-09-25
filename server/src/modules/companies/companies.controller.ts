import { companyBody, companyUpdateBody, idParam } from '@jobportal/shared';
import { authedController, controller } from '../../http/controller';
import { created, ok } from '../../http/respond';
import * as companies from './companies.service';

export const create = authedController({ body: companyBody }, async ({ user, body }) => {
  const company = await companies.createCompany(user, body);
  return created(company, `/api/v1/companies/${company.id}`, 'Company created');
});

export const getOne = controller({ params: idParam }, async ({ params }) => ok(await companies.getCompany(params.id)));

export const update = authedController({ params: idParam, body: companyUpdateBody }, async ({ user, params, body }) =>
  ok(await companies.updateCompany(user, params.id, body))
);
