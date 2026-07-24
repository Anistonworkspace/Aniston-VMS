import { Input } from '@/components/ui';
import { PLAYBACK_ADAPTERS, SELECT_CLASSES } from './cameraConfigForm';
import type { ConfigFormErrors, StreamSpecValue } from './cameraConfigForm';

interface Props {
  value: StreamSpecValue;
  errors: ConfigFormErrors;
  onChange: (patch: Partial<StreamSpecValue>) => void;
  disabled?: boolean;
}

export function StreamSpecFields({ value, errors, onChange, disabled }: Props): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-tertiary">
        Playback adapter
        <select
          className={SELECT_CLASSES}
          value={value.playbackAdapter}
          disabled={disabled}
          onChange={(e) =>
            onChange({ playbackAdapter: e.target.value as StreamSpecValue['playbackAdapter'] })
          }
        >
          {PLAYBACK_ADAPTERS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <Input
        label="Codec"
        value={value.expectedCodec}
        error={errors.expectedCodec}
        disabled={disabled}
        onChange={(e) => onChange({ expectedCodec: e.target.value })}
      />
      <Input
        label="Resolution"
        value={value.expectedResolution}
        error={errors.expectedResolution}
        disabled={disabled}
        onChange={(e) => onChange({ expectedResolution: e.target.value })}
      />
      <Input
        label="Frames per second"
        inputMode="numeric"
        value={value.expectedFps}
        error={errors.expectedFps}
        disabled={disabled}
        onChange={(e) => onChange({ expectedFps: e.target.value })}
      />
      <Input
        label="Bitrate (kbps)"
        inputMode="numeric"
        value={value.expectedBitrateKbps}
        error={errors.expectedBitrateKbps}
        disabled={disabled}
        onChange={(e) => onChange({ expectedBitrateKbps: e.target.value })}
      />
    </div>
  );
}
