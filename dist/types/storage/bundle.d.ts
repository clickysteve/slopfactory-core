import { type SampleMeta, type StoredSample } from './samples';
export declare const BUNDLE_FORMAT = "slopfactory-bundle";
export declare const BUNDLE_VERSION = 1;
export interface BundleManifest {
    format: typeof BUNDLE_FORMAT;
    version: number;
    /** the application that wrote it, e.g. its name */
    app: string;
    /** file name of the project document inside the bundle */
    project: string;
    samples: (Omit<SampleMeta, 'added'> & {
        file: string;
    })[];
}
export interface BundleContents {
    manifest: BundleManifest;
    projectText: string;
    samples: StoredSample[];
    /** samples listed but missing or damaged (the project still opens; those slots are missing) */
    problems: string[];
}
export declare function writeBundle(app: string, projectFile: {
    name: string;
    text: string;
}, samples: StoredSample[]): Uint8Array;
export declare function readBundle(bytes: Uint8Array, app: string): Promise<BundleContents>;
