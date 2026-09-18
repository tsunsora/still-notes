// Matching outlined silhouettes: a closed tab and an open, angled front flap.
const svg=paths=>`<svg class="material-icon folder-state-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${paths}</svg>`;
export const folderIcons={
 folder:svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
 'folder-open':svg('<path d="M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v2"/><path d="m3 18 3.2-6.4a1 1 0 0 1 .9-.6H22l-3.4 7.8a2 2 0 0 1-1.8 1.2H5a2 2 0 0 1-2-2Z"/>')
};
