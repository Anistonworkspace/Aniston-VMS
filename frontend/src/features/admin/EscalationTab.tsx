import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  AnimatedModal,
  Badge,
  Button,
  Input,
  SkeletonTable,
  ToastContainer,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { Select, type SelectOption } from './Select';
import { useToast } from '@/hooks/useToast';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  useCreateEscalationPolicyMutation,
  useCreateEscalationStepMutation,
  useCreateZoneRecipientMutation,
  useDeleteEscalationPolicyMutation,
  useDeleteEscalationStepMutation,
  useDeleteZoneRecipientMutation,
  useListEscalationPoliciesQuery,
  useListZoneOptionsQuery,
  useListZoneRecipientsQuery,
  useUpdateEscalationPolicyMutation,
  useUpdateEscalationStepMutation,
  useUpdateZoneRecipientMutation,
} from './admin.api';
import {
  ALERT_CHANNELS,
  ALERT_SEVERITIES,
  type AlertChannel,
  type AlertSeverity,
  type EscalationPolicy,
  type EscalationStep,
  type ZoneAlertRecipient,
} from './admin.types';
import { ConfirmDialog } from './ConfirmDialog';

const SEVERITY_BADGE: Record<AlertSeverity, 'info' | 'warning' | 'danger'> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

const CHANNEL_BADGE: Record<AlertChannel, 'info' | 'success'> = {
  EMAIL: 'info',
  WHATSAPP: 'success',
};

type Notify = (title: string, description?: string) => void;

// ─── Policy create/edit modal ───

interface PolicyModalProps {
  policy: EscalationPolicy | null;
  zoneOptions: SelectOption[];
  onClose: () => void;
  onSuccess: Notify;
  onError: Notify;
}

function PolicyModal({
  policy,
  zoneOptions,
  onClose,
  onSuccess,
  onError,
}: PolicyModalProps): JSX.Element {
  const isEdit = policy !== null;
  const [name, setName] = useState(policy?.name ?? '');
  const [zoneId, setZoneId] = useState(policy?.zoneId ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [createPolicy, { isLoading: creating }] = useCreateEscalationPolicyMutation();
  const [updatePolicy, { isLoading: updating }] = useUpdateEscalationPolicyMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Policy name is required.');
      return;
    }
    try {
      if (isEdit) {
        await updatePolicy({
          id: policy.id,
          body: { name: name.trim(), zoneId: zoneId === '' ? null : zoneId },
        }).unwrap();
        onSuccess('Policy updated', name.trim());
      } else {
        await createPolicy({ name: name.trim(), ...(zoneId ? { zoneId } : {}) }).unwrap();
        onSuccess('Policy created', name.trim());
      }
      onClose();
    } catch (err) {
      onError('Save failed', getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <AnimatedModal
      open
      onClose={onClose}
      title={isEdit ? 'Edit policy' : 'New escalation policy'}
      size="md"
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          required
        />
        <Select
          label="Zone"
          options={[
            { value: '', label: 'Default — fallback for zones without a policy' },
            ...zoneOptions,
          ]}
          value={zoneId}
          onChange={(event) => setZoneId(event.target.value)}
          hint="Leave on Default to make this the fallback policy."
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create policy'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ─── Step create/edit modal ───

interface StepModalProps {
  policyId: string;
  step: EscalationStep | null;
  onClose: () => void;
  onSuccess: Notify;
  onError: Notify;
}

function StepModal({ policyId, step, onClose, onSuccess, onError }: StepModalProps): JSX.Element {
  const isEdit = step !== null;
  const [afterMinutes, setAfterMinutes] = useState(String(step?.afterMinutes ?? 0));
  const [recipientLevel, setRecipientLevel] = useState(step?.recipientLevel ?? '');
  const [channels, setChannels] = useState<AlertChannel[]>(step?.channels ?? ['EMAIL']);
  const [formError, setFormError] = useState<string | null>(null);
  const [createStep, { isLoading: creating }] = useCreateEscalationStepMutation();
  const [updateStep, { isLoading: updating }] = useUpdateEscalationStepMutation();

  const toggleChannel = (channel: AlertChannel): void => {
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    const minutes = Number(afterMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10_080) {
      setFormError('After minutes must be a whole number between 0 and 10080 (7 days).');
      return;
    }
    if (!recipientLevel.trim()) {
      setFormError('Recipient level is required (e.g. "L1").');
      return;
    }
    if (channels.length === 0) {
      setFormError('Pick at least one channel.');
      return;
    }
    const body = { afterMinutes: minutes, recipientLevel: recipientLevel.trim(), channels };
    try {
      if (isEdit) {
        await updateStep({ policyId, stepId: step.id, body }).unwrap();
        onSuccess('Step updated');
      } else {
        await createStep({ policyId, body }).unwrap();
        onSuccess('Step added');
      }
      onClose();
    } catch (err) {
      onError('Save failed', getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <AnimatedModal
      open
      onClose={onClose}
      title={isEdit ? 'Edit step' : 'Add escalation step'}
      size="md"
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-4"
      >
        <Input
          label="Escalate after (minutes)"
          type="number"
          min={0}
          max={10080}
          value={afterMinutes}
          onChange={(event) => setAfterMinutes(event.target.value)}
          hint="Minutes after the incident opens before this tier is notified (0–10080)."
          required
        />
        <Input
          label="Recipient level"
          value={recipientLevel}
          onChange={(event) => setRecipientLevel(event.target.value)}
          maxLength={100}
          hint='Matches ZoneAlertRecipient escalation tiers, e.g. "L1".'
          required
        />
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-gray-700">Channels</legend>
          <div className="flex gap-4">
            {ALERT_CHANNELS.map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={channels.includes(channel)}
                  onChange={() => toggleChannel(channel)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {channel}
              </label>
            ))}
          </div>
        </fieldset>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Add step'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ─── Zone alert recipient create/edit modal ───

interface RecipientModalProps {
  recipient: ZoneAlertRecipient | null;
  zoneOptions: SelectOption[];
  onClose: () => void;
  onSuccess: Notify;
  onError: Notify;
}

function RecipientModal({
  recipient,
  zoneOptions,
  onClose,
  onSuccess,
  onError,
}: RecipientModalProps): JSX.Element {
  const isEdit = recipient !== null;
  const [zoneId, setZoneId] = useState(recipient?.zoneId ?? '');
  const [severity, setSeverity] = useState<string>(recipient?.severity ?? 'CRITICAL');
  const [channel, setChannel] = useState<string>(recipient?.channel ?? 'EMAIL');
  const [target, setTarget] = useState(recipient?.recipient ?? '');
  const [level, setLevel] = useState(String(recipient?.escalationLevel ?? 1));
  const [formError, setFormError] = useState<string | null>(null);
  const [createRecipient, { isLoading: creating }] = useCreateZoneRecipientMutation();
  const [updateRecipient, { isLoading: updating }] = useUpdateZoneRecipientMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    const levelNumber = Number(level);
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 10) {
      setFormError('Escalation level must be a whole number between 1 and 10.');
      return;
    }
    if (!target.trim()) {
      setFormError('Recipient (email or E.164 phone) is required.');
      return;
    }
    try {
      if (isEdit) {
        await updateRecipient({
          id: recipient.id,
          body: {
            severity: severity as AlertSeverity,
            channel: channel as AlertChannel,
            recipient: target.trim(),
            escalationLevel: levelNumber,
          },
        }).unwrap();
        onSuccess('Recipient updated', target.trim());
      } else {
        if (!zoneId) {
          setFormError('Zone is required.');
          return;
        }
        await createRecipient({
          zoneId,
          severity: severity as AlertSeverity,
          channel: channel as AlertChannel,
          recipient: target.trim(),
          escalationLevel: levelNumber,
        }).unwrap();
        onSuccess('Recipient added', target.trim());
      }
      onClose();
    } catch (err) {
      onError('Save failed', getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <AnimatedModal
      open
      onClose={onClose}
      title={isEdit ? 'Edit alert recipient' : 'New alert recipient'}
      size="md"
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-4"
      >
        {isEdit ? (
          <Input
            label="Zone"
            value={recipient.zone.name}
            disabled
            hint="Zone cannot be changed — create a new recipient instead."
          />
        ) : (
          <Select
            label="Zone"
            options={zoneOptions}
            placeholder="Select a zone…"
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
            required
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Severity"
            options={ALERT_SEVERITIES.map((value) => ({ value, label: value }))}
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          />
          <Select
            label="Channel"
            options={ALERT_CHANNELS.map((value) => ({ value, label: value }))}
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          />
        </div>
        <Input
          label="Recipient"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          maxLength={320}
          hint="Email address or E.164 phone / WhatsApp id."
          required
        />
        <Input
          label="Escalation level"
          type="number"
          min={1}
          max={10}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          hint="1–10 — matched against step recipient tiers."
          required
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Add recipient'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ─── Main tab ───

export function EscalationTab(): JSX.Element {
  const { toasts, dismiss, success, error: toastError } = useToast();

  // Policies
  const [policyPage, setPolicyPage] = useState(1);
  const [policyZone, setPolicyZone] = useState('');
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState<{ policy: EscalationPolicy | null } | null>(null);
  const [stepModal, setStepModal] = useState<{
    policyId: string;
    step: EscalationStep | null;
  } | null>(null);
  const [policyToDelete, setPolicyToDelete] = useState<EscalationPolicy | null>(null);
  const [stepToDelete, setStepToDelete] = useState<{
    policyId: string;
    step: EscalationStep;
  } | null>(null);

  // Recipients
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientZone, setRecipientZone] = useState('');
  const [recipientSeverity, setRecipientSeverity] = useState('');
  const [recipientChannel, setRecipientChannel] = useState('');
  const [recipientModal, setRecipientModal] = useState<{
    recipient: ZoneAlertRecipient | null;
  } | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<ZoneAlertRecipient | null>(null);

  const { data: zonesData } = useListZoneOptionsQuery();
  const zoneOptions = useMemo(
    () => (zonesData?.items ?? []).map((zone) => ({ value: zone.id, label: zone.name })),
    [zonesData]
  );

  const policiesQuery = useMemo(
    () => ({ page: policyPage, limit: 10, ...(policyZone ? { zoneId: policyZone } : {}) }),
    [policyPage, policyZone]
  );
  const {
    data: policies,
    isLoading: policiesLoading,
    isError: policiesError,
    error: policiesErr,
    refetch: refetchPolicies,
  } = useListEscalationPoliciesQuery(policiesQuery);

  const recipientsQuery = useMemo(
    () => ({
      page: recipientPage,
      limit: 10,
      ...(recipientZone ? { zoneId: recipientZone } : {}),
      ...(recipientSeverity ? { severity: recipientSeverity as AlertSeverity } : {}),
      ...(recipientChannel ? { channel: recipientChannel as AlertChannel } : {}),
    }),
    [recipientPage, recipientZone, recipientSeverity, recipientChannel]
  );
  const {
    data: recipients,
    isLoading: recipientsLoading,
    isError: recipientsError,
    error: recipientsErr,
    refetch: refetchRecipients,
  } = useListZoneRecipientsQuery(recipientsQuery);

  const [deletePolicy, { isLoading: deletingPolicy }] = useDeleteEscalationPolicyMutation();
  const [deleteStep, { isLoading: deletingStep }] = useDeleteEscalationStepMutation();
  const [deleteRecipient, { isLoading: deletingRecipient }] = useDeleteZoneRecipientMutation();

  const policyTotalPages = policies ? Math.max(1, Math.ceil(policies.total / policies.limit)) : 1;
  const recipientTotalPages = recipients
    ? Math.max(1, Math.ceil(recipients.total / recipients.limit))
    : 1;

  const handleDeletePolicy = async (): Promise<void> => {
    if (!policyToDelete) return;
    try {
      await deletePolicy(policyToDelete.id).unwrap();
      success('Policy deleted', policyToDelete.name);
      setPolicyToDelete(null);
    } catch (err) {
      toastError(
        'Delete failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  const handleDeleteStep = async (): Promise<void> => {
    if (!stepToDelete) return;
    try {
      await deleteStep({ policyId: stepToDelete.policyId, stepId: stepToDelete.step.id }).unwrap();
      success('Step deleted');
      setStepToDelete(null);
    } catch (err) {
      toastError(
        'Delete failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  const handleDeleteRecipient = async (): Promise<void> => {
    if (!recipientToDelete) return;
    try {
      await deleteRecipient(recipientToDelete.id).unwrap();
      success('Recipient deleted', recipientToDelete.recipient);
      setRecipientToDelete(null);
    } catch (err) {
      toastError(
        'Delete failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Escalation policies ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Escalation policies</h2>
            <p className="text-sm text-gray-500">
              Per-zone step ladders that drive unacknowledged-incident escalation.
            </p>
          </div>
          <div className="ml-auto flex items-end gap-3">
            <div className="w-48">
              <Select
                label="Zone"
                options={[{ value: '', label: 'All zones' }, ...zoneOptions]}
                value={policyZone}
                onChange={(event) => {
                  setPolicyZone(event.target.value);
                  setPolicyPage(1);
                }}
              />
            </div>
            <Button
              size="sm"
              leftIcon={<Plus size={15} />}
              onClick={() => setPolicyModal({ policy: null })}
            >
              New policy
            </Button>
          </div>
        </div>

        {policiesLoading && (
          <div className="rounded-card bg-card p-4 shadow-soft">
            <SkeletonTable rows={4} />
          </div>
        )}
        {policiesError && (
          <div className="rounded-card bg-card p-10 text-center shadow-soft">
            <p className="text-sm text-gray-600">{getApiErrorMessage(policiesErr)}</p>
            <Button
              className="mt-4"
              variant="secondary"
              size="sm"
              onClick={() => {
                void refetchPolicies();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {policies && (
          <div className="rounded-card bg-card shadow-soft">
            {policies.items.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                No escalation policies yet — incidents fall through to defaults.
              </p>
            )}
            {policies.items.map((policy) => (
              <div key={policy.id} className="border-b border-gray-50 last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-label={expandedPolicyId === policy.id ? 'Collapse steps' : 'Expand steps'}
                    onClick={() =>
                      setExpandedPolicyId((current) => (current === policy.id ? null : policy.id))
                    }
                    className="grid h-7 w-7 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <ChevronDown
                      size={16}
                      className={cn(
                        'transition-transform duration-150',
                        expandedPolicyId === policy.id && 'rotate-180'
                      )}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{policy.name}</p>
                    <p className="text-xs text-gray-500">
                      {policy.steps.length} step{policy.steps.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Badge variant={policy.zoneId ? 'primary' : 'default'} size="sm">
                    {policy.zone?.name ?? 'Default'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon={<Plus size={13} />}
                    onClick={() => setStepModal({ policyId: policy.id, step: null })}
                  >
                    Step
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Edit policy"
                    onClick={() => setPolicyModal({ policy })}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Delete policy"
                    onClick={() => setPolicyToDelete(policy)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {expandedPolicyId === policy.id && (
                  <div className="bg-gray-50/60 px-4 py-3 pl-14">
                    {policy.steps.length === 0 && (
                      <p className="text-xs text-gray-500">No steps — add the first tier.</p>
                    )}
                    <ul className="space-y-1.5">
                      {policy.steps.map((step) => (
                        <li
                          key={step.id}
                          className="flex items-center gap-3 rounded-lg bg-white/80 px-3 py-2"
                        >
                          <span className="w-24 text-xs font-medium tabular-nums text-gray-600">
                            +{step.afterMinutes} min
                          </span>
                          <span className="text-sm text-ink">{step.recipientLevel}</span>
                          <span className="flex flex-1 gap-1">
                            {step.channels.map((channel) => (
                              <Badge key={channel} variant={CHANNEL_BADGE[channel]} size="sm">
                                {channel}
                              </Badge>
                            ))}
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label="Edit step"
                            onClick={() => setStepModal({ policyId: policy.id, step })}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label="Delete step"
                            onClick={() => setStepToDelete({ policyId: policy.id, step })}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {policyTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={policyPage <= 1}
                  onClick={() => setPolicyPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <p className="text-xs text-gray-500">
                  Page {policies.page} of {policyTotalPages}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={policyPage >= policyTotalPages}
                  onClick={() =>
                    setPolicyPage((current) => Math.min(policyTotalPages, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Zone alert recipients ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Zone alert recipients</h2>
            <p className="text-sm text-gray-500">
              Who gets notified per zone, severity and channel — matched by escalation level.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select
                label="Zone"
                options={[{ value: '', label: 'All zones' }, ...zoneOptions]}
                value={recipientZone}
                onChange={(event) => {
                  setRecipientZone(event.target.value);
                  setRecipientPage(1);
                }}
              />
            </div>
            <div className="w-36">
              <Select
                label="Severity"
                options={[
                  { value: '', label: 'All' },
                  ...ALERT_SEVERITIES.map((value) => ({ value, label: value })),
                ]}
                value={recipientSeverity}
                onChange={(event) => {
                  setRecipientSeverity(event.target.value);
                  setRecipientPage(1);
                }}
              />
            </div>
            <div className="w-36">
              <Select
                label="Channel"
                options={[
                  { value: '', label: 'All' },
                  ...ALERT_CHANNELS.map((value) => ({ value, label: value })),
                ]}
                value={recipientChannel}
                onChange={(event) => {
                  setRecipientChannel(event.target.value);
                  setRecipientPage(1);
                }}
              />
            </div>
            <Button
              size="sm"
              leftIcon={<Plus size={15} />}
              onClick={() => setRecipientModal({ recipient: null })}
            >
              New recipient
            </Button>
          </div>
        </div>

        {recipientsLoading && (
          <div className="rounded-card bg-card p-4 shadow-soft">
            <SkeletonTable rows={4} />
          </div>
        )}
        {recipientsError && (
          <div className="rounded-card bg-card p-10 text-center shadow-soft">
            <p className="text-sm text-gray-600">{getApiErrorMessage(recipientsErr)}</p>
            <Button
              className="mt-4"
              variant="secondary"
              size="sm"
              onClick={() => {
                void refetchRecipients();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {recipients && (
          <div className="overflow-x-auto rounded-card bg-card shadow-soft">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Zone</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {recipients.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No alert recipients match the current filters.
                    </td>
                  </tr>
                )}
                {recipients.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-50 transition-colors last:border-b-0 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{row.zone.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={SEVERITY_BADGE[row.severity]} size="sm">
                        {row.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CHANNEL_BADGE[row.channel]} size="sm">
                        {row.channel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.recipient}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">L{row.escalationLevel}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="Edit recipient"
                          onClick={() => setRecipientModal({ recipient: row })}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="Delete recipient"
                          onClick={() => setRecipientToDelete(row)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recipientTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={recipientPage <= 1}
                  onClick={() => setRecipientPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <p className="text-xs text-gray-500">
                  Page {recipients.page} of {recipientTotalPages}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={recipientPage >= recipientTotalPages}
                  onClick={() =>
                    setRecipientPage((current) => Math.min(recipientTotalPages, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Modals & confirms ── */}
      {policyModal && (
        <PolicyModal
          policy={policyModal.policy}
          zoneOptions={zoneOptions}
          onClose={() => setPolicyModal(null)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      {stepModal && (
        <StepModal
          policyId={stepModal.policyId}
          step={stepModal.step}
          onClose={() => setStepModal(null)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      {recipientModal && (
        <RecipientModal
          recipient={recipientModal.recipient}
          zoneOptions={zoneOptions}
          onClose={() => setRecipientModal(null)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      <ConfirmDialog
        open={policyToDelete !== null}
        title="Delete policy"
        message={`Delete "${policyToDelete?.name ?? ''}" and all of its steps? Zones using it fall back to the default policy.`}
        confirmLabel="Delete"
        loading={deletingPolicy}
        onConfirm={() => {
          void handleDeletePolicy();
        }}
        onClose={() => setPolicyToDelete(null)}
      />
      <ConfirmDialog
        open={stepToDelete !== null}
        title="Delete step"
        message={`Remove the +${stepToDelete?.step.afterMinutes ?? 0} min → ${stepToDelete?.step.recipientLevel ?? ''} step?`}
        confirmLabel="Delete"
        loading={deletingStep}
        onConfirm={() => {
          void handleDeleteStep();
        }}
        onClose={() => setStepToDelete(null)}
      />
      <ConfirmDialog
        open={recipientToDelete !== null}
        title="Delete recipient"
        message={`Stop alerting ${recipientToDelete?.recipient ?? ''} for ${recipientToDelete?.zone.name ?? ''}?`}
        confirmLabel="Delete"
        loading={deletingRecipient}
        onConfirm={() => {
          void handleDeleteRecipient();
        }}
        onClose={() => setRecipientToDelete(null)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
