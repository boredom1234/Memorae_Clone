export interface UserNote {
  id: string;
  userId: string;
  title?: string;
  content: string;
  tags?: string[];
  category: string;
  isPinned: boolean;
  isArchived: boolean;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface CreateNoteParams {
  userId: string;
  content: string;
  title?: string;
  tags?: string[];
  category?: string;
  isPinned?: boolean;
}
export interface UpdateNoteParams {
  userId: string;
  noteId: string;
  content?: string;
  title?: string;
  tags?: string[];
  category?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}
export interface SearchNotesParams {
  userId: string;
  query: string;
  category?: string;
  tags?: string[];
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}
export interface ListNotesParams {
  userId: string;
  category?: string;
  tags?: string[];
  includeArchived?: boolean;
  onlyPinned?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "updated" | "title";
  sortOrder?: "asc" | "desc";
}
export interface NotesStats {
  total: number;
  categories: {
    [key: string]: number;
  };
  pinned: number;
  recent: number;
}
export interface NoteWithMedia extends UserNote {
  media: Array<{
    id: string;
    mediaType: string;
    fileUrl: string;
    mimeType?: string;
    extractedText?: string;
  }>;
}
