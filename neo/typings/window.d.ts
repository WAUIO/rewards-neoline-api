import { INeoProvider } from '@neongd/neo-provider';

declare global {
  interface Window {
    NEOLine: any;
    NEOLineN3: any;
    neo?: INeoProvider;
  }
}
