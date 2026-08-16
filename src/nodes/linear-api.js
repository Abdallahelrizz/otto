import { getCredential } from '../engine/credentials.js';
import { safeRequestJson } from './service-utils.js';

const LINEAR_BASE = 'https://api.linear.app';

async function linearGraphQL(token, query, variables = {}, signal) {
  return safeRequestJson(`${LINEAR_BASE}/graphql`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
}

export async function linearApi({ config, input, workspaceId, signal }) {
  const cred = await getCredential(config.credentialId, { workspaceId });
  const token = cred.data.apiKey ?? cred.data.token;

  const op = config.operation ?? 'list_issues';
  switch (op) {
    case 'list_issues': {
      const limit = config.limit ?? 25;
      const result = await linearGraphQL(token, `query($first:Int){issues(first:$first){nodes{id title state{name} assignee{name} priority createdAt}}}`, { first: limit }, signal);
      return result.data?.issues?.nodes ?? result;
    }
    case 'get_issue': {
      const issueId = config.issueId ?? input.id;
      const result = await linearGraphQL(token, `query($id:String!){issue(id:$id){id title description state{name} assignee{name} priority url}}`, { id: issueId }, signal);
      return result.data?.issue ?? result;
    }
    case 'create_issue': {
      const result = await linearGraphQL(token,
        `mutation($title:String!,$description:String,$teamId:String!){issueCreate(input:{title:$title,description:$description,teamId:$teamId}){success issue{id title url}}}`,
        { title: config.issueTitle ?? input.title, description: config.description ?? input.description, teamId: config.teamId ?? input.teamId }, signal
      );
      return result.data?.issueCreate ?? result;
    }
    case 'update_issue': {
      const result = await linearGraphQL(token,
        `mutation($id:String!,$title:String,$stateId:String){issueUpdate(id:$id,input:{title:$title,stateId:$stateId}){success issue{id title url}}}`,
        { id: config.issueId ?? input.id, title: config.issueTitle, stateId: config.stateId }, signal
      );
      return result.data?.issueUpdate ?? result;
    }
    case 'list_teams': {
      const result = await linearGraphQL(token, `{teams{nodes{id name key}}}`, {}, signal);
      return result.data?.teams?.nodes ?? result;
    }
    default:
      throw new Error(`Unknown Linear operation: ${op}`);
  }
}
