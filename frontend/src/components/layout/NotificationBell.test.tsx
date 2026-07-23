import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import type { NotificationItem } from '@/features/notifications/notifications.api';

// Shared spies/state used by the hoisted vi.mock factories below. Anything a
// factory references must live in vi.hoisted() (factories are hoisted above
// these decls, otherwise: TDZ "cannot access before initialization").
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  markRead: vi.fn(),
  markAll: vi.fn(),
  refetch: vi.fn(),
  feed: undefined as unknown[] | undefined,
  feedLoading: false,
  feedError: false,
  unreadCount: 0,
}));

// Real navigation would need the whole router tree; spy on useNavigate instead
// so we can assert the deep-link target directly.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => h.navigate };
});

// Mock the per-user notification API surface — the component's whole contract.
// Feed + unread-count are separate queries (the badge count can exceed the
// capped feed → "99+"); the two mutations are optimistic in the real slice, so
// here we only need to assert their triggers fire.
vi.mock('@/features/notifications/notifications.api', () => ({
  useGetNotificationFeedQuery: () => ({
    data: h.feed,
    isLoading: h.feedLoading,
    isError: h.feedError,
    refetch: h.refetch,
  }),
  useGetNotificationUnreadCountQuery: () => ({ data: { count: h.unreadCount } }),
  useMarkNotificationReadMutation: () => [h.markRead, { isLoading: false }],
  useMarkAllNotificationsReadMutation: () => [h.markAll, { isLoading: false }],
}));

// Stub the one leaf dep with a moving part (relative timestamps) so assertions
// stay deterministic; Badge/prettyEnum run real — they're pure and cheap.
vi.mock('@/features/overview/timeAgo', () => ({ timeAgo: () => '2m ago' }));

import { NotificationBell } from './NotificationBell';

function mkItem(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'inc-1',
    code: 'ANI-CAM-2026-000145',
    cameraLabel: 'CAM-042',
    title: 'Camera offline',
    zoneName: 'North Lot',
    siteName: 'HQ',
    kind: 'CAMERA_OFFLINE' as NotificationItem['kind'],
    severity: 'CRITICAL' as NotificationItem['severity'],
    status: 'OPEN' as NotificationItem['status'],
    occurredAt: '2026-01-01T00:00:00Z',
    assignees: [],
    notifiedOverflow: 0,
    isRead: false,
    readAt: null,
    ...over,
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.feed = [mkItem()];
  h.feedLoading = false;
  h.feedError = false;
  h.unreadCount = 1;
});

describe('NotificationBell', () => {
  it('renders closed, with a numeric unread badge reflecting the per-user count', () => {
    h.unreadCount = 3;
    const { container } = renderBell();
    const bell = screen.getByRole('button', { name: /notifications, 3 unread/i });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    // dropdown is not mounted until opened
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // red badge with the count is present
    const badge = container.querySelector('.bg-coral');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('3');
  });

  it('caps the badge at "99+" when the unread count exceeds 99', () => {
    h.unreadCount = 150;
    renderBell();
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('opens the dropdown on click and lists the notification feed (the regression fix)', () => {
    renderBell();
    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    expect(bell).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: /recent incidents/i });
    expect(within(menu).getByText('ANI-CAM-2026-000145')).toBeInTheDocument();
    expect(within(menu).getByText('Camera offline')).toBeInTheDocument();
  });

  it('marks the selected incident read and deep-links to /incidents/:id', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /ANI-CAM-2026-000145/i }));
    expect(h.markRead).toHaveBeenCalledWith('inc-1');
    expect(h.navigate).toHaveBeenCalledWith('/incidents/inc-1');
  });

  it('does not re-mark an already-read incident when selected', () => {
    h.feed = [mkItem({ isRead: true, readAt: '2026-01-01T00:05:00Z' })];
    h.unreadCount = 0;
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /ANI-CAM-2026-000145/i }));
    expect(h.markRead).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith('/incidents/inc-1');
  });

  it('"Mark all read" triggers the mark-all mutation', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(h.markAll).toHaveBeenCalledTimes(1);
  });

  it('disables "Mark all read" when nothing is unread', () => {
    h.feed = [mkItem({ isRead: true, readAt: '2026-01-01T00:05:00Z' })];
    h.unreadCount = 0;
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    const markAllBtn = screen.getByRole('button', { name: /mark all read/i });
    expect(markAllBtn).toBeDisabled();
    fireEvent.click(markAllBtn);
    expect(h.markAll).not.toHaveBeenCalled();
  });

  it('"View all incidents" navigates to the incidents list', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /view all incidents/i }));
    expect(h.navigate).toHaveBeenCalledWith('/incidents');
  });

  it('shows no badge and an empty state when there are no notifications', () => {
    h.feed = [];
    h.unreadCount = 0;
    const { container } = renderBell();
    expect(container.querySelector('.bg-coral')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/no new notifications/i)).toBeInTheDocument();
  });

  it('shows a loading state while the feed is fetching', () => {
    h.feed = undefined;
    h.feedLoading = true;
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry that refetches the feed', () => {
    h.feed = undefined;
    h.feedError = true;
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/couldn’t load notifications/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    renderBell();
    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });
});
