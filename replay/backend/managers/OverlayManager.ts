import { BrowserWindow } from 'electron';
import BaseOverlay from '../overlays/BaseOverlay';
import MainMenu from '../overlays/MainMenu';
import LocationsMenu from '../overlays/LocationsMenu';
import IRectangle from '~shared/interfaces/IRectangle';
import CommandOverlay from '../overlays/CommandOverlay';
import MessageOverlay from '../overlays/MessageOverlay';
import ListMenu from '~backend/overlays/ListMenu';

export default class OverlayManager {
  private overlays: BaseOverlay[] = [];

  public start() {
    // this.overlays.push(new FindOverlay());
    this.overlays.push(new MainMenu());
    this.overlays.push(new ListMenu());
    this.overlays.push(new LocationsMenu());
    this.overlays.push(new CommandOverlay());
    this.overlays.push(new MessageOverlay());
  }

  public show(name: string, browserWindow: BrowserWindow, rect: IRectangle, ...args: any[]) {
    this.getByName(name).show(browserWindow, { rect }, ...args);
  }

  public toggle(name: string, browserWindow: BrowserWindow, rect: IRectangle) {
    const overlay = this.getByName(name);
    if (overlay.visible) {
      overlay.hide();
    } else {
      overlay.show(browserWindow, { rect });
    }
  }

  public get browserViews() {
    return Array.from(this.overlays).map(x => x.browserView);
  }

  public destroy = () => {
    this.browserViews.length = 0;
  };

  public sendToAll = (channel: string, ...args: any[]) => {
    this.browserViews.forEach(x => x?.webContents.send(channel, ...args));
  };

  public getByName(name: string) {
    return this.overlays.find(x => x.name === name);
  }

  public getByWebContentsId(webContentsId: number) {
    return this.overlays.find(x => x.id === webContentsId);
  }

  public isVisible(name: string) {
    return this.getByName(name).visible;
  }
}
