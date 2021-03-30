import IResourceHeaders from './IResourceHeaders';
import IHttpResourceLoadDetails from './IHttpResourceLoadDetails';

export default interface IResourceResponse {
  url: string;
  timestamp: string;
  headers: IResourceHeaders;
  trailers?: IResourceHeaders;
  browserServedFromCache?: IHttpResourceLoadDetails['browserServedFromCache'];
  browserLoadFailure?: string;
  remoteAddress: string;
  statusCode: number;
  statusMessage?: string;
}
