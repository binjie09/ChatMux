import { saveSessionMetadata, type SaveSessionMetadataInput, type TmuxSession } from "./api";
import { errorMessage } from "./view-utils";

type SessionMetadataSaverOptions = {
  hostId: string;
  selectedSessionName: string;
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onSessionsChange: (updater: (current: TmuxSession[]) => TmuxSession[]) => void;
};

export function useSessionMetadataSaver(options: SessionMetadataSaverOptions) {
  return async (input: SaveSessionMetadataInput) => {
    if (!options.hostId || !options.selectedSessionName) {
      return;
    }
    try {
      const metadata = await saveSessionMetadata(options.hostId, options.selectedSessionName, input);
      options.onSessionsChange((current) => current.map((session) => (
        session.name === metadata.sessionName ? {
          ...session,
          owner: metadata.owner,
          tags: metadata.tags,
          title: metadata.title,
        } : session
      )));
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
    }
  };
}
