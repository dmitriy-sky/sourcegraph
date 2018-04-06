import { Folder as FolderIcon } from '@sourcegraph/icons/lib/Folder'
import { Loader } from '@sourcegraph/icons/lib/Loader'
import { Repo as RepositoryIcon } from '@sourcegraph/icons/lib/Repo'
import escapeRegexp from 'escape-string-regexp'
import * as H from 'history'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { Observable } from 'rxjs/Observable'
import { merge } from 'rxjs/observable/merge'
import { of } from 'rxjs/observable/of'
import { catchError } from 'rxjs/operators/catchError'
import { distinctUntilChanged } from 'rxjs/operators/distinctUntilChanged'
import { map } from 'rxjs/operators/map'
import { publishReplay } from 'rxjs/operators/publishReplay'
import { refCount } from 'rxjs/operators/refCount'
import { switchMap } from 'rxjs/operators/switchMap'
import { Subject } from 'rxjs/Subject'
import { Subscription } from 'rxjs/Subscription'
import { makeRepoURI } from '.'
import { gql, queryGraphQL } from '../backend/graphql'
import { PageTitle } from '../components/PageTitle'
import { displayRepoPath } from '../components/RepoFileLink'
import { submitSearch } from '../search/helpers'
import { QueryInput } from '../search/QueryInput'
import { SearchButton } from '../search/SearchButton'
import { SearchHelp } from '../search/SearchHelp'
import { asError, createAggregateError, ErrorLike, isErrorLike } from '../util/errors'
import { memoizeObservable } from '../util/memoize'
import { toPrettyBlobURL, toTreeURL } from '../util/url'
import { GitCommitNode } from './commits/GitCommitNode'
import { gitCommitFragment } from './commits/RepositoryCommitsPage'
import { searchQueryForRepoRev } from './RepoContainer'

const DirectoryEntry: React.SFC<{
    isDir: boolean
    name: string
    parentPath: string
    repoPath: string
    rev?: string
}> = ({ isDir, name, parentPath, repoPath, rev }) => {
    const filePath = parentPath ? parentPath + '/' + name : name
    return (
        <Link
            to={(isDir ? toTreeURL : toPrettyBlobURL)({
                repoPath,
                rev,
                filePath,
            })}
            className="directory-entry"
            title={filePath}
        >
            {name}
            {isDir && '/'}
        </Link>
    )
}

export const fetchTree = memoizeObservable(
    (ctx: { repoPath: string; commitID: string; filePath: string }): Observable<GQL.ITree> =>
        queryGraphQL(
            gql`
                query Tree($repoPath: String!, $commitID: String!, $filePath: String!) {
                    repository(uri: $repoPath) {
                        commit(rev: $commitID) {
                            tree(path: $filePath) {
                                directories {
                                    name
                                }
                                files {
                                    name
                                }
                            }
                        }
                    }
                }
            `,
            ctx
        ).pipe(
            map(({ data, errors }) => {
                if (!data || errors || !data.repository || !data.repository.commit || !data.repository.commit.tree) {
                    throw createAggregateError(errors)
                }
                return data.repository.commit.tree
            })
        ),
    makeRepoURI
)

export const fetchTreeCommits = memoizeObservable(
    (ctx: { repoPath: string; commitID: string; filePath: string }): Observable<GQL.IGitCommit[]> =>
        queryGraphQL(
            gql`
                query TreeCommits($repoPath: String!, $commitID: String!, $filePath: String!) {
                    repository(uri: $repoPath) {
                        commit(rev: $commitID) {
                            file(path: $filePath) {
                                commits {
                                    ...GitCommitFields
                                }
                            }
                        }
                    }
                }
                ${gitCommitFragment}
            `,
            ctx
        ).pipe(
            map(({ data, errors }) => {
                if (
                    !data ||
                    errors ||
                    !data.repository ||
                    !data.repository.commit ||
                    !data.repository.commit.file ||
                    !data.repository.commit.file.commits
                ) {
                    throw createAggregateError(errors)
                }
                return data.repository.commit.file.commits
            })
        ),
    makeRepoURI
)

interface Props {
    repoPath: string
    repoDescription: string
    // filePath is a directory path in DirectoryPage. We call it filePath for consistency elsewhere.
    filePath: string
    commitID: string
    rev?: string

    location: H.Location
    history: H.History
}

interface State {
    /** This directory's tree, or an error. Undefined while loading. */
    treeOrError?: GQL.ITree | ErrorLike

    /** A log of the most recent commits for this tree, or an error. Undefined while loading. */
    commitsOrError?: GQL.IGitCommit[] | ErrorLike

    /**
     * The value of the search query input field.
     */
    query: string
}

export class DirectoryPage extends React.PureComponent<Props, State> {
    public state: State = { query: '' }

    private componentUpdates = new Subject<Props>()
    private subscriptions = new Subscription()

    public componentDidMount(): void {
        this.subscriptions.add(
            this.componentUpdates
                .pipe(
                    distinctUntilChanged(
                        (x, y) =>
                            x.repoPath === y.repoPath &&
                            x.rev === y.rev &&
                            x.commitID === y.commitID &&
                            x.filePath === y.filePath
                    ),
                    switchMap(props =>
                        merge(
                            of({ treeOrError: undefined, commitsOrError: undefined } as Pick<
                                State,
                                'treeOrError' | 'commitsOrError'
                            >),
                            fetchTree(props).pipe(
                                catchError(err => [asError(err)]),
                                map(c => ({ treeOrError: c })),
                                publishReplay<Pick<State, 'treeOrError'>>(),
                                refCount()
                            ),
                            fetchTreeCommits(props).pipe(
                                catchError(err => [asError(err)]),
                                map(c => ({ commitsOrError: c })),
                                publishReplay<Pick<State, 'commitsOrError'>>(),
                                refCount()
                            )
                        )
                    )
                )
                .subscribe(stateUpdate => this.setState(stateUpdate), err => console.error(err))
        )

        this.componentUpdates.next(this.props)
    }

    public componentWillReceiveProps(newProps: Props): void {
        this.componentUpdates.next(newProps)
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    private getQueryPrefix(): string {
        let queryPrefix = searchQueryForRepoRev(this.props.repoPath, this.props.rev)
        if (this.props.filePath) {
            queryPrefix += `file:^${escapeRegexp(this.props.filePath)}/ `
        }
        return queryPrefix
    }

    public render(): JSX.Element | null {
        return (
            <div className="directory-page">
                <PageTitle key="page-title" title={this.getPageTitle()} />
                {this.props.filePath ? (
                    <header>
                        <h1 className="directory-page__title">
                            <FolderIcon className="icon-inline" /> {this.props.filePath}
                        </h1>
                    </header>
                ) : (
                    <header>
                        <h1 className="directory-page__title">
                            <RepositoryIcon className="icon-inline" /> {displayRepoPath(this.props.repoPath)}
                        </h1>
                        {this.props.repoDescription && <p>{this.props.repoDescription}</p>}
                    </header>
                )}

                <section className="directory-page__section">
                    <h3 className="directory-page__section-header">
                        Search in this {this.props.filePath ? 'directory' : 'repository'}
                    </h3>
                    <form className="directory-page__section-search" onSubmit={this.onSubmit}>
                        <QueryInput
                            value={this.state.query}
                            onChange={this.onQueryChange}
                            prependQueryForSuggestions={this.getQueryPrefix()}
                            autoFocus={true}
                            location={this.props.location}
                            history={this.props.history}
                            placeholder=""
                        />
                        <SearchButton />
                        <SearchHelp />
                    </form>
                </section>
                {this.state.treeOrError === undefined && (
                    <div>
                        <Loader className="icon-inline directory-page__entries-loader" /> Loading files and directories
                    </div>
                )}
                {this.state.treeOrError !== undefined &&
                    (isErrorLike(this.state.treeOrError) ? (
                        <div className="alert alert-danger">
                            <p>Unable to list directory contents</p>
                            {this.state.treeOrError.message && (
                                <div>
                                    <pre>{this.state.treeOrError.message.slice(0, 100)}</pre>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {this.state.treeOrError.directories.length > 0 && (
                                <section className="directory-page__section">
                                    <h3 className="directory-page__section-header">Directories</h3>
                                    <div className="directory-page__entries directory-page__entries-directories">
                                        {this.state.treeOrError.directories.map((e, i) => (
                                            <DirectoryEntry
                                                key={i}
                                                isDir={true}
                                                name={e.name}
                                                parentPath={this.props.filePath}
                                                repoPath={this.props.repoPath}
                                                rev={this.props.rev}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                            {this.state.treeOrError.files.length > 0 && (
                                <section className="directory-page__section">
                                    <h3 className="directory-page__section-header">Files</h3>
                                    <div className="directory-page__entries directory-page__entries-files">
                                        {this.state.treeOrError.files.map((e, i) => (
                                            <DirectoryEntry
                                                key={i}
                                                isDir={false}
                                                name={e.name}
                                                parentPath={this.props.filePath}
                                                repoPath={this.props.repoPath}
                                                rev={this.props.rev}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    ))}
                {this.state.commitsOrError === undefined &&
                    this.state.treeOrError !== undefined && (
                        <div>
                            <Loader className="icon-inline directory-page__entries-loader" /> Loading commits
                        </div>
                    )}
                {this.state.commitsOrError !== undefined &&
                    (isErrorLike(this.state.commitsOrError) ? (
                        <div className="alert alert-danger">
                            <p>Unable to list commits</p>
                            {this.state.commitsOrError.message && (
                                <div>
                                    <pre>{this.state.commitsOrError.message.slice(0, 100)}</pre>
                                </div>
                            )}
                        </div>
                    ) : (
                        this.state.commitsOrError.length > 0 && (
                            <section className="directory-page__section directory-page__section--commits">
                                {this.props.rev && (
                                    <div>
                                        From <code>{this.props.rev}</code>
                                    </div>
                                )}
                                <div className="list-group">
                                    {this.state.commitsOrError.map((c, i) => (
                                        <GitCommitNode key={i} compact={true} node={c} repoName={this.props.repoPath} />
                                    ))}
                                </div>
                            </section>
                        )
                    ))}
            </div>
        )
    }

    private onQueryChange = (query: string) => this.setState({ query })

    private onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault()
        submitSearch(
            this.props.history,
            { query: this.getQueryPrefix() + this.state.query },
            this.props.filePath ? 'tree' : 'repo'
        )
    }

    private getPageTitle(): string {
        const repoPathSplit = this.props.repoPath.split('/')
        const repoStr = repoPathSplit.length > 2 ? repoPathSplit.slice(1).join('/') : this.props.repoPath
        if (this.props.filePath) {
            const fileOrDir = this.props.filePath.split('/').pop()
            return `${fileOrDir} - ${repoStr}`
        }
        return `${repoStr}`
    }
}
