export type SaveParticipant = {
  flush: () => Promise<boolean>;
  dirty: () => boolean;
  exportText: () => string;
};
