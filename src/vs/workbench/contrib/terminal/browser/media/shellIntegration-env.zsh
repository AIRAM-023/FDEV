# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
ORIGINAL_ZDOTDIR=$ZDOTDIR
if [[ -f ~/.zshenv ]]; then
	. ~/.zshenv
fi
USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$ORIGINAL_ZDOTDIR"
if [ -z "${USER_ZDOTDIR}" ]; then
	USER_ZDOTDIR="~"
fi
echo "User ZDOTDIR $USER_ZDOTDIR"
