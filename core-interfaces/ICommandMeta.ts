export default interface ICommandMeta {
  id: number;
  tabId: number;
  frameId: string;
  name: string;
  args?: string;
  startDate: string;
  endDate?: string;
  result?: any;
  resultType?: string;
}
