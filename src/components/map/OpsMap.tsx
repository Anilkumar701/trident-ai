import { GoogleTrafficMap } from './GoogleTrafficMap';

interface OpsMapProps {
  tall?: boolean;
}

export function OpsMap({ tall = false }: OpsMapProps) {
  return <GoogleTrafficMap tall={tall} />;
}
