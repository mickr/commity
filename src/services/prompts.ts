interface GitDiff {
	filename: string;
	diff: string;
}

export const defaultCommitMessagePrompt = `
    You are a helpful assistant that generates commit messages for a Git repository.
    You are given a list of changes that have been made to the repository. Each change is a file and the diff of the changes.
    You need to generate a commit message for the changes.
    The commit message should be a single line of text that describes the changes.
    The commit message should be in the following format:
    `;

export const generateCommitMessagePrompt = (changes: GitDiff[]) => {
	return `
    You are a helpful assistant that generates commit messages for a Git repository.
    You are given a list of changes that have been made to the repository. Each change is a file and the diff of the changes.
    You need to generate a commit message for the changes.
    The commit message should be a single line of text that describes the changes.
    The commit message should be in the following format:
    ${changes}
    `;
};
