// @flow

import React from "react";

import RepoLink from "sourcegraph/components/RepoLink";
import {Label} from "sourcegraph/components";

import CSSModules from "react-css-modules";
import styles from "./styles/Repo.css";

class NavContext extends React.Component {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		inventory: React.PropTypes.object,
		repoNavContext: React.PropTypes.element,
	};

	_isLanguageUnsupported(): bool {
		if (!this.props.inventory || !this.props.inventory.Languages || !this.props.inventory.PrimaryProgrammingLanguage) return false; // innocent until proven guilty
		return this.props.inventory.Languages.filter((lang) => ["Go", "Java", "JavaScript"].includes(lang.Name)).length === 0;
	}

	render() {
		return (
			<div styleName="nav">
				{this._isLanguageUnsupported() &&
					<Label style={{marginRight: "10px"}} color="warning">
						{`${this.props.inventory.PrimaryProgrammingLanguage} is not yet supported`}
					</Label>
				}
				<RepoLink repo={this.props.repo} rev={this.props.rev} />
				<div styleName="repo-nav-context">{this.props.repoNavContext}</div>
			</div>
		);
	}
}

export default CSSModules(NavContext, styles);
