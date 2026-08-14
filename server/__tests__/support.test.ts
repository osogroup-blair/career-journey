import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTicketForUser, TicketAccessError, TicketNotFoundError, listTicketsForUser } from '../support';
import type { App } from 'firebase-admin/app';

// Set up mock for firebase-admin/firestore
const mockGet = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();

const chain = {
  where: mockWhere,
  orderBy: mockOrderBy,
  get: mockGet,
};

mockWhere.mockReturnValue(chain);
mockOrderBy.mockReturnValue(chain);
mockCollection.mockReturnValue({
  doc: mockDoc,
  ...chain
});
mockDoc.mockReturnValue({
  get: mockGet,
  collection: mockCollection
});

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: () => ({
      collection: mockCollection,
      runTransaction: vi.fn()
    })
  };
});

describe('Support Ticket Access Control', () => {
  const mockApp = {} as App;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTicketForUser throws TicketNotFoundError if ticket does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    await expect(getTicketForUser(mockApp, 'user1', 'ticket1')).rejects.toThrowError(TicketNotFoundError);
  });

  it('getTicketForUser throws TicketAccessError if uid does not match', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'user2', adminNotes: 'secret' })
    });

    await expect(getTicketForUser(mockApp, 'user1', 'ticket1')).rejects.toThrowError(TicketAccessError);
  });

  it('getTicketForUser strips adminNotes when user owns ticket', async () => {
    // Mock the ticket get
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'user1', adminNotes: 'secret note', title: 'A bug' })
    });
    
    // Mock the messages get
    mockGet.mockResolvedValueOnce({ docs: [] });

    const result = await getTicketForUser(mockApp, 'user1', 'ticket1');
    expect((result.ticket as any).adminNotes).toBeUndefined();
    expect(result.ticket.title).toBe('A bug');
  });

  it('listTicketsForUser strips adminNotes for all returned tickets', async () => {
    mockGet.mockResolvedValueOnce({
      docs: [
        { data: () => ({ uid: 'user1', adminNotes: 'secret 1', title: 'Bug 1', createdAt: '2023-01-02' }) },
        { data: () => ({ uid: 'user1', adminNotes: 'secret 2', title: 'Bug 2', createdAt: '2023-01-01' }) }
      ]
    });

    const results = await listTicketsForUser(mockApp, 'user1');
    expect(results.length).toBe(2);
    expect((results[0] as any).adminNotes).toBeUndefined();
    expect((results[1] as any).adminNotes).toBeUndefined();
    expect(results[0].title).toBe('Bug 1'); // due to sorting byNewestFirst
  });
});
