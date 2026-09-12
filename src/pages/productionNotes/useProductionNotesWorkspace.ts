import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { logActivity } from "@/services/auditLogger";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import {
  archiveNoteFolder,
  createNoteFolder,
  listVisibleNoteFolders,
  renameNoteFolder,
  setNoteFolderLinks,
} from "@/lib/noteFolders/repository";
import { noteFolderQueryKeys } from "@/lib/noteFolders/queryKeys";
import type { VisibleNoteFolder } from "@/lib/noteFolders/types";
import type {
  ProductionNoteCreateInput,
  ProductionNotePatch,
  ProductionNoteRecord,
  ProductionNotesProject,
} from "./productionNotesDerive";
import { selectActiveFolder } from "./productionNotesDerive";

interface UseProductionNotesWorkspaceInput {
  orgId: string | null;
  meetingDate: string;
  selectedFolderId: string | null;
  onSelectedFolderArchived: (nextFolderId: string | null) => void;
  onLinksUpdated: () => void;
}

interface UpdateNoteInput {
  id: string;
  data: ProductionNotePatch;
}

interface CreateFolderInput {
  parentFolderId: string | null;
  name: string;
}

interface RenameFolderInput {
  folder: VisibleNoteFolder;
  name: string;
}

interface LinkFolderInput {
  folder: VisibleNoteFolder;
  projectIds: string[];
  makeIndependent: boolean;
}

const listProjects = () =>
  entities.Project.list() as Promise<ProductionNotesProject[]>;

const listNotes = (meetingDate: string, activeFolderId: string | null) =>
  entities.ProductionNote.filter(
    activeFolderId
      ? { note_date: meetingDate, folder_id: activeFolderId }
      : { note_date: meetingDate },
    "created_at",
  ) as Promise<ProductionNoteRecord[]>;

export function useProductionNotesWorkspace({
  orgId,
  meetingDate,
  selectedFolderId,
  onSelectedFolderArchived,
  onLinksUpdated,
}: UseProductionNotesWorkspaceInput) {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    staleTime: 5 * 60 * 1000,
  });

  const foldersQuery = useQuery({
    queryKey: noteFolderQueryKeys.workspace(orgId, false),
    queryFn: () => listVisibleNoteFolders({ orgId: orgId as string }),
    enabled: Boolean(orgId),
    staleTime: 30 * 1000,
  });
  const selectedFolder = selectActiveFolder(
    foldersQuery.data?.folders ?? [],
    selectedFolderId,
    foldersQuery.data?.general_notes_id,
  );
  const activeFolderId = selectedFolder?.id ?? null;
  const notesKey = ["production-notes", meetingDate, activeFolderId] as const;

  const notesQuery = useQuery({
    queryKey: notesKey,
    queryFn: () => listNotes(meetingDate, activeFolderId),
    enabled: Boolean(activeFolderId),
    staleTime: 30 * 1000,
  });

  const refreshFolders = () => {
    void queryClient.invalidateQueries({ queryKey: ["note-folders"] });
    void invalidateEntity(queryClient, "note_folder");
    void invalidateEntity(queryClient, "production_note");
  };

  const createNote = useMutation({
    mutationFn: (data: ProductionNoteCreateInput) =>
      entities.ProductionNote.create(
        withProjectId(data, data.project_id),
      ) as Promise<ProductionNoteRecord>,
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: notesKey });
      const previous = queryClient.getQueryData<ProductionNoteRecord[]>(notesKey);
      const optimistic: ProductionNoteRecord = {
        ...data,
        id: `tmp-${Date.now()}-${Math.random()}`,
        _optimistic: true,
      };
      queryClient.setQueryData<ProductionNoteRecord[]>(notesKey, (old = []) => [
        ...old,
        optimistic,
      ]);
      return { previous };
    },
    onError: (error, _data, context) => {
      if (context?.previous) queryClient.setQueryData(notesKey, context.previous);
      toast.error(toUserErrorMessage(error, "Failed to add bullet"));
    },
    onSuccess: (record, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["production-notes"] });
      void logActivity("production_note", "created", record, {
        projectId: variables.project_id,
        projectName: variables.project_name,
        description: `Added bullet to ${variables.project_name} (${meetingDate})`,
      });
    },
  });

  const updateNote = useMutation({
    mutationFn: ({ id, data }: UpdateNoteInput) =>
      entities.ProductionNote.update(id, data) as Promise<ProductionNoteRecord>,
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: notesKey });
      const previous = queryClient.getQueryData<ProductionNoteRecord[]>(notesKey);
      queryClient.setQueryData<ProductionNoteRecord[]>(notesKey, (old = []) =>
        old.map((note) => (note.id === id ? { ...note, ...data } : note)),
      );
      return { previous };
    },
    onError: (error, _data, context) => {
      if (context?.previous) queryClient.setQueryData(notesKey, context.previous);
      toast.error(toUserErrorMessage(error, "Update failed"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["production-notes"] });
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => entities.ProductionNote.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesKey });
      const previous = queryClient.getQueryData<ProductionNoteRecord[]>(notesKey);
      queryClient.setQueryData<ProductionNoteRecord[]>(notesKey, (old = []) =>
        old.filter((note) => note.id !== id),
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(notesKey, context.previous);
      toast.error(toUserErrorMessage(error, "Delete failed"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["production-notes"] });
    },
  });

  const createFolder = useMutation({
    mutationFn: ({ parentFolderId, name }: CreateFolderInput) =>
      createNoteFolder({ orgId: orgId as string, name, parentFolderId }),
    onSuccess: () => {
      refreshFolders();
      toast.success("Folder created");
    },
    onError: (error) =>
      toast.error(toUserErrorMessage(error, "Could not create folder")),
  });

  const renameFolder = useMutation({
    mutationFn: ({ folder, name }: RenameFolderInput) =>
      renameNoteFolder({
        folderId: folder.id,
        name,
        expectedVersion: folder.version,
      }),
    onSuccess: () => {
      refreshFolders();
      toast.success("Folder renamed");
    },
    onError: (error) =>
      toast.error(toUserErrorMessage(error, "Could not rename folder")),
  });

  const archiveFolder = useMutation({
    mutationFn: (folder: VisibleNoteFolder) =>
      archiveNoteFolder({
        folderId: folder.id,
        expectedVersion: folder.version,
      }),
    onSuccess: (_data, folder) => {
      if (selectedFolderId === folder.id) {
        onSelectedFolderArchived(foldersQuery.data?.general_notes_id ?? null);
      }
      refreshFolders();
      toast.success("Folder archived");
    },
    onError: (error) =>
      toast.error(toUserErrorMessage(error, "Could not archive folder")),
  });

  const linkFolder = useMutation({
    mutationFn: ({ folder, projectIds, makeIndependent }: LinkFolderInput) =>
      setNoteFolderLinks({
        folderId: folder.id,
        projectIds,
        expectedVersion: folder.version,
        makeIndependent,
      }),
    onSuccess: () => {
      onLinksUpdated();
      refreshFolders();
      void queryClient.invalidateQueries({ queryKey: ["production-notes"] });
      toast.success("Job links updated");
    },
    onError: (error) =>
      toast.error(toUserErrorMessage(error, "Could not update job links")),
  });

  return {
    projectsQuery,
    foldersQuery,
    notesQuery,
    selectedFolder,
    activeFolderId,
    createNote,
    updateNote,
    deleteNote,
    createFolder,
    renameFolder,
    archiveFolder,
    linkFolder,
  };
}
