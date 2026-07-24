import { Input } from '@/components/ui';
import type { ConfigFormErrors, RtspValue } from './cameraConfigForm';

interface Props {
  value: RtspValue;
  errors: ConfigFormErrors;
  mode: 'create' | 'edit';
  onChange: (patch: Partial<RtspValue>) => void;
  disabled?: boolean;
}

export function RtspCredentialFields({
  value,
  errors,
  mode,
  onChange,
  disabled,
}: Props): JSX.Element {
  const keepHint = mode === 'edit' ? 'Leave blank to keep the saved value' : undefined;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input
        label="Main RTSP URL"
        placeholder={mode === 'edit' ? '•••• (unchanged)' : 'rtsp://…'}
        hint={keepHint}
        value={value.mainRtspUrl}
        error={errors.mainRtspUrl}
        disabled={disabled}
        onChange={(e) => onChange({ mainRtspUrl: e.target.value })}
      />
      <Input
        label="Sub RTSP URL"
        placeholder={mode === 'edit' ? '•••• (unchanged)' : 'rtsp://…'}
        hint={keepHint}
        value={value.subRtspUrl}
        error={errors.subRtspUrl}
        disabled={disabled}
        onChange={(e) => onChange({ subRtspUrl: e.target.value })}
      />
      <Input
        label="RTSP username"
        autoComplete="off"
        hint={keepHint}
        value={value.rtspUsername}
        error={errors.rtspUsername}
        disabled={disabled}
        onChange={(e) => onChange({ rtspUsername: e.target.value })}
      />
      <Input
        label="RTSP password"
        type="password"
        autoComplete="new-password"
        hint={keepHint}
        value={value.rtspPassword}
        error={errors.rtspPassword}
        disabled={disabled}
        onChange={(e) => onChange({ rtspPassword: e.target.value })}
      />
      <Input
        label="ONVIF port (optional)"
        inputMode="numeric"
        value={value.onvifPort}
        error={errors.onvifPort}
        disabled={disabled}
        onChange={(e) => onChange({ onvifPort: e.target.value })}
      />
    </div>
  );
}
