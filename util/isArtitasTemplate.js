import { has } from "lodash-es";

export default function isArtitasTemplate(parsedJson) {
    if(!!parsedJson.version && !!parsedJson.asset?.Name &&
        (parsedJson.asset.$t == "4" || parsedJson.asset.$type == "Artitas.Template") &&
        (parsedJson.$t == "15" || parsedJson.$type == "Common.Content.DataStructures.VersionedAsset") &&
        (!parsedJson.asset.Parent || (
            parsedJson.asset.Parent.$t == "ar_Template" ||
            parsedJson.asset.Parent.$type == "Common.Content.AssetReference`1[[Artitas.Template, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]]"
        )))
        // The above statement logs `true` but returns `undefined` if I don't do this.
        // Why? I have no bloody clue, but I'll take the win.
        return true; 
}