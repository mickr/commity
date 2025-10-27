export interface Change {
	uri: { fsPath: string };
	originalUri?: { fsPath: string };
	status: number;
}

export interface Repository {
	state: {
		indexChanges: Change[];
		HEAD: {
			name: string;
		};
	};
	rootUri: { fsPath: string };
}

export interface API {
	repositories: Repository[];
}
