import { Response } from 'express';
import fetch from 'node-fetch';
import { IKamihime } from '../../../typings';
import Route from '../../struct/Route';

export default class IndexRoute extends Route {
  constructor () {
    super({
      id: 'index',
      method: 'get',
      route: [ '/' ]
    });
  }

  public async exec (_, res: Response) {
    const endPoint = this.server.auth.rootURL + 'api/';

    const hot: IKamihime[] = await this.server.util.db('kamihime')
      .select([ 'id', 'name', 'tier', 'rarity', 'peeks', 'created' ])
      .where('approved', 1)
      .orderBy('peeks', 'desc')
      .limit(10);

    const latestRequest = await fetch(endPoint + 'latest?len=10', { headers: { Accept: 'application/json' } });
    const latest = await latestRequest.json();
    const status = this.server.status;
    const requested = { latest, hot, status };

    res.render('index', requested);
  }
}
