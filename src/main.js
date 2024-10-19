import { Client, Databases, Query, Teams, Users } from 'node-appwrite';

// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');
  const users = new Users(client);
  const databases = new Databases(client);
  const teams = new Teams(client);

  if (req.path === '/users') {
    const { queries = [] } = req.body;
    try {
      const userList = await users.list(queries);
      const teamList = (await teams.list()).teams
      const finalList = userList.users.map(async user => {
        const {membership, team} = teamList.map(async t => {
          const memberships = (await teams.listMemberships(t.$id)).memberships
          const membership = memberships.find(m => m.userId === user.$id)
          const team = teamList.find(tt => tt.$id === membership.teamId)
          return { team, membership };
        })
        log(user)
        return {
          ...user,
          team: team ? team : undefined,
          membership: membership? membership : undefined,
          roles: membership? membership.roles : undefined,
        };
      })
      log(finalList)
      return res.json({finalList, total: userList.total});
    } catch (e) {
      log(e);
      return res.text('');
    }
  }

  if (req.path === '/total') {
    try {
      const cases = await databases.listDocuments(
        'mega_dental_data',
        '66dda08500057cc4e21c',
        [Query.limit(1), Query.select(['date'])]
      );
      const doctors = await databases.listDocuments(
        'mega_dental_data',
        '66dc203400027b5e3c73',
        [Query.limit(1), Query.select(['$id'])]
      );
      const labs = (await teams.list()).total;
      return res.json({
        cases: cases.total,
        doctors: doctors.total,
        teams: labs,
      });
    } catch (e) {
      log(e);
      return res.text('');
    }
  }

  return res.text('');
};
