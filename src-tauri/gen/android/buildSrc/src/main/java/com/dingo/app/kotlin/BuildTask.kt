import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        val projectRoot = File(project.projectDir, rootDirRel)

        val buildType = if (release) "release" else "debug"
        val libName = "libdingo_lib.so"
        val targetTriple = mapOf(
            "aarch64" to "aarch64-linux-android",
            "arm" to "armv7-linux-androideabi",
            "armv7" to "armv7-linux-androideabi",
            "x86_64" to "x86_64-linux-android",
            "i686" to "i686-linux-android"
        ).getOrDefault(target, target)
        val soSource = projectRoot.toPath().resolve("target").resolve(targetTriple).resolve(buildType).resolve(libName)
        val abiDir = mapOf(
            "aarch64" to "arm64-v8a",
            "arm" to "armeabi-v7a",
            "armv7" to "armeabi-v7a",
            "x86_64" to "x86_64",
            "i686" to "x86"
        ).getOrDefault(target, "arm64-v8a")
        val soDest = project.projectDir.toPath().resolve("app").resolve("src").resolve("main").resolve("jniLibs").resolve(abiDir).resolve(libName)

        if (!Files.exists(soSource)) {
            throw GradleException("Rust .so not found at $soSource. Run cargo build first.")
        }

        soDest.parent.toFile().mkdirs()
        Files.copy(soSource, soDest, StandardCopyOption.REPLACE_EXISTING)
        project.logger.lifecycle("Copied $libName from $soSource to $soDest")
    }
}