import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatedModal, Button, Input } from '@/components/ui';
import type { useToast } from '@/hooks/useToast';
import { getApiErrorMessage } from '@/lib/apiError';
import { Select } from './Select';
import { Switch } from './Switch';
import {
  useCreateRegionMutation,
  useCreateRouterMutation,
  useCreateSiteMutation,
  useCreateZoneMutation,
  useUpdateRegionMutation,
  useUpdateRouterMutation,
  useUpdateSiteMutation,
  useUpdateZoneMutation,
} from './settings.api';
import type {
  LifecycleStatus,
  Region,
  Router as HierarchyRouterModel,
  Site,
  Zone,
} from './settings.types';

type Toast = ReturnType<typeof useToast>;

const STATUS_OPTIONS: Array<{ value: LifecycleStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

// ── Region ──────────────────────────────────────────────────────────────
// Mirrors backend/src/modules/hierarchy/hierarchy.schemas.ts `createRegionSchema`.
const regionFormSchema = z.object({
  name: z.string().min(1, 'Required').max(100, 'Max 100 characters'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type RegionFormValues = z.infer<typeof regionFormSchema>;

interface RegionFormModalProps {
  open: boolean;
  onClose: () => void;
  toast: Toast;
  region?: Region;
}

export function RegionFormModal({ open, onClose, toast, region }: RegionFormModalProps) {
  const isEdit = !!region;
  const [createRegion, { isLoading: creating }] = useCreateRegionMutation();
  const [updateRegion, { isLoading: updating }] = useUpdateRegionMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegionFormValues>({
    resolver: zodResolver(regionFormSchema),
    defaultValues: { name: region?.name ?? '', status: region?.status ?? 'ACTIVE' },
  });

  useEffect(() => {
    if (open) reset({ name: region?.name ?? '', status: region?.status ?? 'ACTIVE' });
  }, [open, region, reset]);

  async function onSubmit(values: RegionFormValues) {
    try {
      if (isEdit && region) {
        await updateRegion({ id: region.id, body: values }).unwrap();
        toast.success('Region updated');
      } else {
        await createRegion(values).unwrap();
        toast.success('Region created');
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? 'Could not update region' : 'Could not create region',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit region' : 'Add region'}
      size="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status')}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create region'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ── Zone ────────────────────────────────────────────────────────────────
// Mirrors backend/src/modules/hierarchy/hierarchy.schemas.ts `createZoneSchema`.
// Empty strings (blank optional coordinate inputs) are normalized to
// `undefined` before the number coercion runs, so leaving a field blank
// omits it instead of coercing to 0.
const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : val),
    z.coerce.number().min(min).max(max).optional()
  );

const zoneFormSchema = z.object({
  name: z.string().min(1, 'Required').max(150, 'Max 150 characters'),
  latitude: optionalCoordinate(-90, 90),
  longitude: optionalCoordinate(-180, 180),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type ZoneFormValues = z.infer<typeof zoneFormSchema>;

interface ZoneFormModalProps {
  open: boolean;
  onClose: () => void;
  toast: Toast;
  regionId: string;
  zone?: Zone;
}

export function ZoneFormModal({ open, onClose, toast, regionId, zone }: ZoneFormModalProps) {
  const isEdit = !!zone;
  const [createZone, { isLoading: creating }] = useCreateZoneMutation();
  const [updateZone, { isLoading: updating }] = useUpdateZoneMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      name: zone?.name ?? '',
      latitude: zone?.latitude ?? undefined,
      longitude: zone?.longitude ?? undefined,
      status: zone?.status ?? 'ACTIVE',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: zone?.name ?? '',
        latitude: zone?.latitude ?? undefined,
        longitude: zone?.longitude ?? undefined,
        status: zone?.status ?? 'ACTIVE',
      });
    }
  }, [open, zone, reset]);

  async function onSubmit(values: ZoneFormValues) {
    const body = {
      name: values.name,
      status: values.status,
      latitude: values.latitude,
      longitude: values.longitude,
    };
    try {
      if (isEdit && zone) {
        await updateZone({ id: zone.id, body }).unwrap();
        toast.success('Zone updated');
      } else {
        await createZone({ ...body, regionId }).unwrap();
        toast.success('Zone created');
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? 'Could not update zone' : 'Could not create zone',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit zone' : 'Add zone'}
      size="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Latitude"
            hint="Optional"
            error={errors.latitude?.message}
            {...register('latitude')}
          />
          <Input
            label="Longitude"
            hint="Optional"
            error={errors.longitude?.message}
            {...register('longitude')}
          />
        </div>
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status')}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create zone'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ── Site ────────────────────────────────────────────────────────────────
// Mirrors backend/src/modules/hierarchy/hierarchy.schemas.ts `createSiteSchema`.
const siteFormSchema = z.object({
  name: z.string().min(1, 'Required').max(200, 'Max 200 characters'),
  address: z.string().min(1, 'Required').max(500, 'Max 500 characters'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  clientId: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type SiteFormValues = z.infer<typeof siteFormSchema>;

interface SiteFormModalProps {
  open: boolean;
  onClose: () => void;
  toast: Toast;
  zoneId: string;
  site?: Site;
}

export function SiteFormModal({ open, onClose, toast, zoneId, site }: SiteFormModalProps) {
  const isEdit = !!site;
  const [createSite, { isLoading: creating }] = useCreateSiteMutation();
  const [updateSite, { isLoading: updating }] = useUpdateSiteMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: {
      name: site?.name ?? '',
      address: site?.address ?? '',
      latitude: site?.latitude ?? 0,
      longitude: site?.longitude ?? 0,
      clientId: site?.clientId ?? '',
      status: site?.status ?? 'ACTIVE',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: site?.name ?? '',
        address: site?.address ?? '',
        latitude: site?.latitude ?? 0,
        longitude: site?.longitude ?? 0,
        clientId: site?.clientId ?? '',
        status: site?.status ?? 'ACTIVE',
      });
    }
  }, [open, site, reset]);

  async function onSubmit(values: SiteFormValues) {
    const body = {
      name: values.name,
      address: values.address,
      latitude: values.latitude,
      longitude: values.longitude,
      clientId: values.clientId || undefined,
      status: values.status,
    };
    try {
      if (isEdit && site) {
        await updateSite({ id: site.id, body }).unwrap();
        toast.success('Site updated');
      } else {
        await createSite({ ...body, zoneId }).unwrap();
        toast.success('Site created');
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? 'Could not update site' : 'Could not create site',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit site' : 'Add site'}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Input label="Address" error={errors.address?.message} {...register('address')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" error={errors.latitude?.message} {...register('latitude')} />
          <Input label="Longitude" error={errors.longitude?.message} {...register('longitude')} />
        </div>
        <Input
          label="Client ID"
          hint="Optional"
          error={errors.clientId?.message}
          {...register('clientId')}
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status')}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create site'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ── Router ──────────────────────────────────────────────────────────────
// Mirrors backend/src/modules/hierarchy/hierarchy.schemas.ts `createRouterSchema`.
const routerFormSchema = z.object({
  serialNumber: z.string().min(1, 'Required').max(100),
  imei: z.string().min(1, 'Required').max(100),
  simNumber: z.string().min(1, 'Required').max(100),
  operator: z.string().min(1, 'Required').max(100),
  publicStaticIp: z.string().min(1, 'Required').max(100),
  managementPort: z.coerce.number().int().min(1).max(65535),
  model: z.string().min(1, 'Required').max(100),
  firmwareVersion: z.string().min(1, 'Required').max(100),
  connectionStatus: z.string().max(50).optional(),
  dataApiAvailable: z.boolean(),
});
type RouterFormValues = z.infer<typeof routerFormSchema>;

interface RouterFormModalProps {
  open: boolean;
  onClose: () => void;
  toast: Toast;
  siteId: string;
  router?: HierarchyRouterModel;
}

export function RouterFormModal({ open, onClose, toast, siteId, router }: RouterFormModalProps) {
  const isEdit = !!router;
  const [createRouter, { isLoading: creating }] = useCreateRouterMutation();
  const [updateRouter, { isLoading: updating }] = useUpdateRouterMutation();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RouterFormValues>({
    resolver: zodResolver(routerFormSchema),
    defaultValues: {
      serialNumber: router?.serialNumber ?? '',
      imei: router?.imei ?? '',
      simNumber: router?.simNumber ?? '',
      operator: router?.operator ?? '',
      publicStaticIp: router?.publicStaticIp ?? '',
      managementPort: router?.managementPort ?? 8080,
      model: router?.model ?? '',
      firmwareVersion: router?.firmwareVersion ?? '',
      connectionStatus: router?.connectionStatus ?? 'UNKNOWN',
      dataApiAvailable: router?.dataApiAvailable ?? false,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        serialNumber: router?.serialNumber ?? '',
        imei: router?.imei ?? '',
        simNumber: router?.simNumber ?? '',
        operator: router?.operator ?? '',
        publicStaticIp: router?.publicStaticIp ?? '',
        managementPort: router?.managementPort ?? 8080,
        model: router?.model ?? '',
        firmwareVersion: router?.firmwareVersion ?? '',
        connectionStatus: router?.connectionStatus ?? 'UNKNOWN',
        dataApiAvailable: router?.dataApiAvailable ?? false,
      });
    }
  }, [open, router, reset]);

  async function onSubmit(values: RouterFormValues) {
    try {
      if (isEdit && router) {
        await updateRouter({ id: router.id, body: values }).unwrap();
        toast.success('Router updated');
      } else {
        await createRouter({ ...values, siteId }).unwrap();
        toast.success('Router created');
      }
      onClose();
    } catch (err) {
      toast.error(
        isEdit ? 'Could not update router' : 'Could not create router',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit router' : 'Add router'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Serial number"
            error={errors.serialNumber?.message}
            {...register('serialNumber')}
          />
          <Input label="IMEI" error={errors.imei?.message} {...register('imei')} />
          <Input label="SIM number" error={errors.simNumber?.message} {...register('simNumber')} />
          <Input label="Operator" error={errors.operator?.message} {...register('operator')} />
          <Input
            label="Public static IP"
            error={errors.publicStaticIp?.message}
            {...register('publicStaticIp')}
          />
          <Input
            label="Management port"
            type="number"
            error={errors.managementPort?.message}
            {...register('managementPort')}
          />
          <Input label="Model" error={errors.model?.message} {...register('model')} />
          <Input
            label="Firmware version"
            error={errors.firmwareVersion?.message}
            {...register('firmwareVersion')}
          />
          <Select
            label="Connection status"
            options={[
              { value: 'ONLINE', label: 'Online' },
              { value: 'OFFLINE', label: 'Offline' },
              { value: 'UNKNOWN', label: 'Unknown' },
            ]}
            error={errors.connectionStatus?.message}
            {...register('connectionStatus')}
          />
        </div>
        <Switch
          checked={watch('dataApiAvailable')}
          onChange={(checked) => setValue('dataApiAvailable', checked)}
          label="Data API available"
          description="This router exposes a reachable data/telemetry API."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create router'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}
