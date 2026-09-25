import { applicationListQuery, applicationUpdateBody, applyBody, idParam, noteBody } from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { created, ok } from '../../http/respond';
import * as applications from './applications.service';

export const apply = authedController({ body: applyBody }, async ({ user, body }) => {
  const application = await applications.apply(user, body);
  return created(application, `/api/v1/applications/${application.id}`, 'Application submitted');
});

export const list = authedController({ query: applicationListQuery }, async ({ user, query }) => {
  const page = await applications.list(user, query);
  return ok(page.items, { meta: page.meta });
});

export const getOne = authedController({ params: idParam }, async ({ user, params }) => ok(await applications.get(user, params.id)));

export const update = authedController({ params: idParam, body: applicationUpdateBody }, async ({ user, params, body }) =>
  ok(await applications.updateStatus(user, params.id, body.status))
);

export const applicant = authedController({ params: idParam }, async ({ user, params }) =>
  ok(await applications.applicantProfile(user, params.id))
);

export const listNotes = authedController({ params: idParam }, async ({ user, params }) =>
  ok(await applications.listNotes(user, params.id))
);

export const addNote = authedController({ params: idParam, body: noteBody }, async ({ user, params, body }) => {
  const note = await applications.addNote(user, params.id, body.text);
  return created(note, `/api/v1/applications/${params.id}/notes`);
});
