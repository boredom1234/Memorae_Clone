export interface List {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  notes?: string;
  is_completed: boolean;
  completed_at?: string;
  position: number;
  reminder_id?: string;
  created_at: string;
  updated_at: string;
}
export interface ListWithItems extends List {
  items?: ListItem[];
  itemCount?: number;
}
export interface SearchResult {
  type: "list" | "item";
  listId: string;
  listName: string;
  itemId?: string;
  itemContent?: string;
  relevanceScore: number;
}
export interface ListStats {
  totalLists: number;
  totalItems: number;
  completedItems: number;
  completionRate: number;
  mostActiveList: {
    id: string;
    name: string;
    itemCount: number;
  } | null;
  recentlyUpdated: Array<{
    id: string;
    name: string;
    updatedAt: string;
  }>;
}
