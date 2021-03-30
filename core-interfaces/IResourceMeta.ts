import IResourceRequest from './IResourceRequest';
import IResourceResponse from './IResourceResponse';
import ResourceType from './ResourceType';

export default interface IResourceMeta {
  id: number;
  tabId: number;
  url: string;
  request: IResourceRequest;
  response?: IResourceResponse;
  type: ResourceType;
  isRedirect?: boolean;
  receivedAtCommandId?: number;
  seenAtCommandId?: number;
}
