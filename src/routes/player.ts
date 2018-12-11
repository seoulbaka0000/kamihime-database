import { Request, Response } from 'express';
import Route from '../struct/Route';
import * as fs from 'fs-extra';
import * as path from 'path';

const COOLDOWN = 1000 * 60 * 3;
const MAX_VISITS = 3;

const SCENARIOS = 'https://cf.static.r.kamihimeproject.dmmgames.com/scenarios/';
const BG_IMAGE = SCENARIOS + 'bgimage/';
const FG_IMAGE = SCENARIOS + 'fgimage/';

export default class PlayerRoute extends Route {
  constructor() {
    super({
      id: 'player',
      method: 'get',
      route: ['/player/:id/:ep/:type']
    });
  }

  async exec(req: Request, res: Response): Promise<void> {
    const { id = null, ep = null, type = null } = req.params;

    try {
      if (!(id || ep || type )) throw { code: 422, message: 'Incomplete query was given.' };

      const template = type === 'story'
        ? 'player/story'
        : type === 'scenario'
          ? 'player/scenario'
          : type === 'legacy'
            ? 'player/legacy'
            : null;
      const episodes = {
        story1: 'harem1Resource1',
        story2: 'harem2Resource1',
        scenario2: 'harem2Resource2',
        legacy2: 'harem2Resource2',
        story3: 'harem3Resource1',
        scenario3: 'harem3Resource2',
        legacy3: 'harem3Resource2'
      };
      const selected = episodes[type + ep];

      if (!(template || selected || id.charAt(0) === 'k' && ep === 3))
        throw { code: 422, message: 'Invalid episode or player type.' };

      let fields = ['id', 'name'];
      fields = fields.concat([selected, `harem${ep}Title`]);

      const [ character ] = await this.server.util.db('kamihime').select(fields)
        .where('id', id);
      const resource = character[selected];

      if (!character) throw { code: 404 };
      if (!resource)
        throw { code: 404, message: ['Episode Resource is empty.', 'Please contact the maintainer!'] };

      const script = await this._find('script.json', id, resource);

      if (!(template || character || script)) throw { code: 404 };

      const files = await this._find('files.rsc', id, resource);

      if (!files)
        throw { code: 404, message: ['Episode Resource is unexpectedly empty.', 'Please contact the maintainer!'] };

      let folder = resource.slice(-4);
      const fLen = folder.length / 2;
      folder = `${folder.slice(0, fLen)}/${folder.slice(fLen)}}/`;
      const data = {
        files,
        script,
        SCENARIOS: SCENARIOS + folder
      };

      if (type === 'story')
        Object.assign(data, { BG_IMAGE, FG_IMAGE });

      res.render(template, data);
    } catch (err) { this.server.util.handleSiteError(res, err); }
  }

  // -- Util

  /**
   * Finds the file for requested episode.
   * @param name The name of the file
   * @param id The character ID
   * @param res The Resource ID for given template
   */
  protected async _find(name: string, id: string, res: string): Promise<any> {
    const filePath = path.resolve(__dirname, '../../static/scenarios', id, res, name);

    try {
      const file = await fs.readFile(filePath);

      return JSON.parse(file.toString());
    } catch { return false; }
  }

  protected _checkRegistered(req: Request, resource: string): boolean {
    const _resource = this.server.recentVisitors.get(resource);
    if (!_resource) return false;

    const logged = _resource.get(req.ip);
    if (!logged) return false;

    return true;
  }

  protected async _rateLimit(req: Request, character: any, resource: string): Promise<void> {
    const visitorVisits = this.server.recentVisitors.filter((log, _resource) => {
      const logged = log.get(req.ip);
      if (!logged) return false;

      const timeLapsed: number = Date.now() - logged;

      return _resource !== resource && timeLapsed < COOLDOWN;
    });

    if (visitorVisits.size >= MAX_VISITS) throw { code: 429, message: 'You may only do 3 visits per 3 minutes.' };

    const currentRegistered = this._checkRegistered(req, resource);
    if (!currentRegistered) {
      await this.server.util.db('kamihime').update('peeks', ++character.peeks)
        .where('id', character.id);
      this.server.recentVisitors.get(resource).set(req.ip, Date.now());

      this.server.util.logger.status(`[A] Peek: ${req.ip} visited ${character.name}`);
    }
  }
}
