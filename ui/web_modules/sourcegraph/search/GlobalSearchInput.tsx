// tslint:disable: typedef ordered-imports

import * as React from "react";
import {Input, Props as InputProps} from "sourcegraph/components/Input";
import * as styles from "sourcegraph/search/styles/GlobalSearchInput.css";
import * as base from "sourcegraph/components/styles/_base.css";
import * as invariant from "invariant";
import {Search} from "sourcegraph/components/symbols/index";
import * as classNames from "classnames";

// If the user clicks the magnifying glass icon, the cursor should be
// placed at the end of the text, not the beginning. Without this event
// handler, these clicks would place the cursor at the beginning.
function positionCursorAtEndIfIconClicked(ev: React.MouseEvent<HTMLInputElement>) {
	if (ev.button !== 0) {
		return;
	}

	const input = ev.target as HTMLInputElement;
	invariant(input instanceof HTMLInputElement, "target is not <input>");

	// See if we clicked on the magnifying glass.
	const b = input.getBoundingClientRect();
	const x = ev.clientX - b.left;
	const y = ev.clientY - b.top;
	// See if we clicked on the upper-padding of the element. Usually this moves
	// the selector to the beginning of the input field which is undesierable.
	const pt = parseInt(window.getComputedStyle(input).getPropertyValue("padding-top"), 10);

	const indent = parseInt(window.getComputedStyle(input).getPropertyValue("text-indent"), 10);
	invariant(indent > 0, "couldn't find input text-indent");

	// Focus at cursor if click is beyond the icon's bounds (with some pixels of buffer).
	if (x > (indent + 3) && y >= pt) {
		return;
	}

	ev.preventDefault();
	input.setSelectionRange(input.value.length, input.value.length);
	input.focus();
}

interface Props extends InputProps {
	query: string;
	showIcon?: boolean; // whether to show a magnifying glass icon
	className?: string;
}

export function GlobalSearchInput(props: Props) {
	let other = Object.assign({}, props);
	delete other.query;
	delete other.showIcon;
	delete other.className;
	return (
		<div className={classNames(styles.flex_fill, styles.relative, base.mr3)}>
			{props.showIcon &&
				<Search width={16} style={{top: "11px", left: "10px"}} className={classNames(styles.absolute, styles.cool_mid_gray_fill, styles.layer_btm)} />
			}
			<Input
				{...other}
				id="e2etest-search-input"
				type="text"
				onMouseDown={props.showIcon ? positionCursorAtEndIfIconClicked : undefined}
				block={true}
				autoCorrect="off"
				autoCapitalize="off"
				spellCheck={false}
				autoComplete="off"
				defaultValue={props.query}
				className={props.className || ""}
				style={{textIndent: props.showIcon ? "18px" : "0px", backgroundColor: "transparent"}} />
		</div>
	);
}
