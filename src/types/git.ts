import type * as vscode from "vscode";

export const enum RefType {
	Head,
	RemoteHead,
	Tag,
}

export const enum Status {
	INDEX_MODIFIED,
	INDEX_ADDED,
	INDEX_DELETED,
	INDEX_RENAMED,
	INDEX_COPIED,
	MODIFIED,
	DELETED,
	UNTRACKED,
	IGNORED,
	INTENT_TO_ADD,
	INTENT_TO_RENAME,
	TYPE_CHANGED,
	ADDED_BY_US,
	ADDED_BY_THEM,
	DELETED_BY_US,
	DELETED_BY_THEM,
	BOTH_ADDED,
	BOTH_DELETED,
	BOTH_MODIFIED,
}

export interface Change {
	readonly uri: vscode.Uri;
	readonly originalUri: vscode.Uri;
	readonly renameUri: vscode.Uri | undefined;
	readonly status: Status;
}

export interface CommitShortStat {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export interface Commit {
	readonly hash: string;
	readonly message: string;
	readonly parents: string[];
	readonly authorDate?: Date;
	readonly authorName?: string;
	readonly authorEmail?: string;
	readonly commitDate?: Date;
	readonly shortStat?: CommitShortStat;
}

export interface Ref {
	readonly type: RefType;
	readonly name?: string;
	readonly commit?: string;
	readonly commitDetails?: Commit;
	readonly remote?: string;
}

export interface UpstreamRef {
	readonly remote: string;
	readonly name: string;
	readonly commit?: string;
}

export interface Branch extends Ref {
	readonly upstream?: UpstreamRef;
	readonly ahead?: number;
	readonly behind?: number;
}

export interface Remote {
	readonly name: string;
	readonly fetchUrl?: string;
	readonly pushUrl?: string;
	readonly isReadOnly: boolean;
}

export interface Submodule {
	readonly name: string;
	readonly path: string;
	readonly url: string;
}

export interface InputBox {
	value: string;
}

export interface RepositoryUIState {
	readonly selected: boolean;
	readonly onDidChange: vscode.Event<void>;
}

export interface RepositoryState {
	readonly HEAD: Branch | undefined;
	readonly refs: Ref[];
	readonly remotes: Remote[];
	readonly submodules: Submodule[];
	readonly rebaseCommit: Commit | undefined;
	readonly mergeChanges: Change[];
	readonly indexChanges: Change[];
	readonly workingTreeChanges: Change[];
	readonly untrackedChanges: Change[];
	readonly onDidChange: vscode.Event<void>;
}

export interface LogOptions {
	readonly maxEntries?: number;
	readonly path?: string;
	readonly range?: string;
	readonly reverse?: boolean;
	readonly sortByAuthorDate?: boolean;
	readonly shortStats?: boolean;
	readonly author?: string;
	readonly grep?: string;
	readonly refNames?: string[];
	readonly maxParents?: number;
	readonly skip?: number;
}

export interface CommitOptions {
	all?: boolean | "tracked";
	amend?: boolean;
	signoff?: boolean;
	signCommit?: boolean;
	empty?: boolean;
	noVerify?: boolean;
	requireUserConfig?: boolean;
	useEditor?: boolean;
	verbose?: boolean;
	postCommitCommand?: string | null;
}

export interface FetchOptions {
	remote?: string;
	ref?: string;
	all?: boolean;
	prune?: boolean;
	depth?: number;
}

export const enum ForcePushMode {
	Force,
	ForceWithLease,
	ForceWithLeaseIfIncludes,
}

export interface Repository {
	readonly rootUri: vscode.Uri;
	readonly inputBox: InputBox;
	readonly state: RepositoryState;
	readonly ui?: RepositoryUIState;
	readonly onDidCommit?: vscode.Event<void>;
	readonly onDidCheckout?: vscode.Event<void>;

	getConfigs?(): Promise<{ key: string; value: string }[]>;
	getConfig?(key: string): Promise<string>;
	setConfig?(key: string, value: string): Promise<string>;
	unsetConfig?(key: string): Promise<string>;
	getGlobalConfig?(key: string): Promise<string>;

	getObjectDetails?(
		treeish: string,
		path: string
	): Promise<{ mode: string; object: string; size: number }>;
	detectObjectType?(object: string): Promise<{ mimetype: string; encoding?: string }>;
	buffer?(ref: string, path: string): Promise<Buffer>;
	show?(ref: string, path: string): Promise<string>;
	getCommit?(ref: string): Promise<Commit>;

	add?(paths: string[]): Promise<void>;
	revert?(paths: string[]): Promise<void>;
	clean?(paths: string[]): Promise<void>;

	apply?(patch: string, reverse?: boolean): Promise<void>;
	diff?(cached?: boolean): Promise<string>;
	diffWithHEAD?(): Promise<Change[]>;
	diffWithHEAD?(path: string): Promise<string>;
	diffWithHEADShortStats?(path?: string): Promise<CommitShortStat>;
	diffWith?(ref: string): Promise<Change[]>;
	diffWith?(ref: string, path: string): Promise<string>;
	diffIndexWithHEAD?(): Promise<Change[]>;
	diffIndexWithHEAD?(path: string): Promise<string>;
	diffIndexWithHEADShortStats?(path?: string): Promise<CommitShortStat>;
	diffIndexWith?(ref: string): Promise<Change[]>;
	diffIndexWith?(ref: string, path: string): Promise<string>;
	diffBlobs?(object1: string, object2: string): Promise<string>;
	diffBetween?(ref1: string, ref2: string): Promise<Change[]>;
	diffBetween?(ref1: string, ref2: string, path: string): Promise<string>;

	hashObject?(data: string): Promise<string>;

	createBranch?(name: string, checkout: boolean, ref?: string): Promise<void>;
	deleteBranch?(name: string, force?: boolean): Promise<void>;
	getBranch?(name: string): Promise<Branch>;
	getBranches?(
		query: {
			remote?: boolean;
			contains?: string;
			count?: number;
			pattern?: string | string[];
			sort?: "alphabetically" | "committerdate";
		},
		cancellationToken?: vscode.CancellationToken
	): Promise<Ref[]>;
	getBranchBase?(name: string): Promise<Branch | undefined>;
	setBranchUpstream?(name: string, upstream: string): Promise<void>;

	checkIgnore?(paths: string[]): Promise<Set<string>>;

	getRefs?(
		query: {
			contains?: string;
			count?: number;
			pattern?: string | string[];
			sort?: "alphabetically" | "committerdate";
		},
		cancellationToken?: vscode.CancellationToken
	): Promise<Ref[]>;

	getMergeBase?(ref1: string, ref2: string): Promise<string | undefined>;

	tag?(name: string, upstream: string): Promise<void>;
	deleteTag?(name: string): Promise<void>;

	status?(): Promise<void>;
	checkout?(treeish: string): Promise<void>;

	addRemote?(name: string, url: string): Promise<void>;
	removeRemote?(name: string): Promise<void>;
	renameRemote?(name: string, newName: string): Promise<void>;

	fetch?(options?: FetchOptions): Promise<void>;
	fetch?(remote?: string, ref?: string, depth?: number): Promise<void>;
	pull?(unshallow?: boolean): Promise<void>;
	push?(
		remoteName?: string,
		branchName?: string,
		setUpstream?: boolean,
		force?: ForcePushMode
	): Promise<void>;

	blame?(path: string): Promise<string>;
	log(options?: LogOptions): Promise<Commit[]>;

	commit?(message: string, opts?: CommitOptions): Promise<void>;
	merge?(ref: string): Promise<void>;
	mergeAbort?(): Promise<void>;

	applyStash?(index?: number): Promise<void>;
	popStash?(index?: number): Promise<void>;
	dropStash?(index?: number): Promise<void>;
}

export interface API {
	repositories: Repository[];
}
